import { GoogleGenAI, Type } from "@google/genai";
import { ManualData } from "../types";
import { GEMINI_MODEL, SYSTEM_INSTRUCTION } from "../constants";

// Helper to wait
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to generate IDs
const generateId = () => Math.random().toString(36).substring(2, 9);

/** 本番（Cloud Run）では API キーが PLACEHOLDER でビルドされるため、プロキシ経由にする */
function useProxy(): boolean {
  if (typeof window === "undefined") return false;
  const key = process.env.API_KEY ? process.env.API_KEY.trim() : "";
  return !key || key === "PLACEHOLDER";
}

/** プロキシ経由時はアップロード応答の URL を自サーバー向けに書き換える */
function rewriteUploadUrlIfNeeded(uploadUrl: string): string {
  if (!useProxy() || typeof window === "undefined") return uploadUrl;
  return uploadUrl.replace(
    /^https:\/\/generativelanguage\.googleapis\.com/,
    window.location.origin + "/api-proxy"
  );
}

/**
 * Uploads a file to Google AI Studio via the File API using standard fetch.
 * 本番では /api-proxy 経由でサーバー側の API キーを使用する。
 */
export async function uploadFile(file: File, onProgress: (progress: number) => void): Promise<string> {
  const apiKey = process.env.API_KEY ? process.env.API_KEY.trim() : "";
  const viaProxy = useProxy();
  if (!viaProxy && !apiKey) {
    throw new Error("APIキーが見つかりません。");
  }

  const contentType = file.type || "application/octet-stream";

  const metadata = {
    file: {
      display_name: file.name,
      mime_type: contentType,
    },
  };

  const startUrl = viaProxy
    ? "/api-proxy/upload/v1beta/files"
    : `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;

  try {
    const startUploadResponse = await fetch(startUrl, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": file.size.toString(),
        "X-Goog-Upload-Header-Content-Type": contentType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(metadata),
      mode: viaProxy ? "same-origin" : "cors",
      credentials: viaProxy ? "same-origin" : "omit",
    });

    if (!startUploadResponse.ok) {
      const errorText = await startUploadResponse.text();
      throw new Error(`アップロードの開始に失敗しました: ${startUploadResponse.statusText} - ${errorText}`);
    }

    let uploadUrl = startUploadResponse.headers.get("X-Goog-Upload-URL");
    if (!uploadUrl) {
      throw new Error("Gemini APIからアップロードURLを取得できませんでした。");
    }
    uploadUrl = rewriteUploadUrlIfNeeded(uploadUrl);
    if (!viaProxy && !uploadUrl.includes("key=")) {
      uploadUrl = `${uploadUrl}${uploadUrl.includes("?") ? "&" : "?"}key=${apiKey}`;
    }

    onProgress(10);

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
        "Content-Type": contentType,
      },
      body: file,
      mode: viaProxy ? "same-origin" : "cors",
      credentials: viaProxy ? "same-origin" : "omit",
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`ファイルデータのアップロードに失敗しました: ${uploadResponse.statusText} - ${errorText}`);
    }

    const uploadResult = await uploadResponse.json();
    const fileUri = uploadResult.file.uri;
    const fileName = uploadResult.file.name;

    onProgress(100);

    const stateUrl = viaProxy
      ? `/api-proxy/v1beta/${fileName}`
      : `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`;

    let state = "PROCESSING";
    while (state === "PROCESSING") {
      await delay(2000);
      try {
        const stateResponse = await fetch(stateUrl, {
          mode: viaProxy ? "same-origin" : "cors",
          credentials: viaProxy ? "same-origin" : "omit",
        });
        if (!stateResponse.ok) {
           // If we can't check state, we might just assume it's still processing or fail? 
           // Let's retry on next loop unless it's a 4xx
           if (stateResponse.status >= 400 && stateResponse.status < 500) {
              throw new Error("ファイルの状態確認に失敗しました: " + stateResponse.statusText);
           }
           continue; 
        }
        const stateResult = await stateResponse.json();
        state = stateResult.state;
        if (state === "FAILED") {
          throw new Error("Geminiによる動画処理に失敗しました。");
        }
      } catch (checkErr) {
        console.warn("Error checking file state, retrying...", checkErr);
        // Continue loop to retry
      }
    }

    return fileUri;
  } catch (error: any) {
    console.error("Upload error details:", error);
    if (error.message && (error.message.includes("Failed to fetch") || error.message.includes("NetworkError"))) {
      throw new Error("ネットワークエラー: Google APIに接続できません。インターネット接続とAPIキーを確認してください。");
    }
    throw error;
  }
}

/**
 * Generates the manual content using Gemini.
 */
export async function generateManualFromVideo(
  fileUri: string,
  language: string,
  fileMimeType: string
): Promise<ManualData> {
  const apiKey = process.env.API_KEY ? process.env.API_KEY.trim() : "";
  const viaProxy = useProxy();
  if (!viaProxy && !apiKey) {
    throw new Error("APIキーが見つかりません。");
  }

  const ai = new GoogleGenAI({
    apiKey: viaProxy ? " " : apiKey,
    ...(viaProxy && typeof window !== "undefined" && { httpOptions: { baseUrl: window.location.origin + "/api-proxy" } }),
  });
  
  const prompt = `
    Analyze the uploaded video to create a step-by-step procedure manual in ${language}.
    
    1. Analyze the video content (audio narration + visual actions).
    2. Identify distinct procedural steps.
    3. For each step, provide:
       - step_number: Integer
       - timestamp: Start time in MM:SS format
       - timestamp_seconds: Start time in seconds (integer)
       - title: Brief, actionable title
       - description: Detailed instructions
       - screenshot_timestamp_seconds: The best moment (in seconds) to capture a screenshot for this step.
    
    Return the result in JSON format matching the schema.
    Ensure steps are logically sequenced.
  `;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          parts: [
            {
              fileData: {
                fileUri: fileUri,
                mimeType: fileMimeType,
              },
            },
            { text: prompt },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Title of the manual" },
            language: { type: Type.STRING, description: "Language code of the manual content" },
            steps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  step_number: { type: Type.INTEGER },
                  timestamp: { type: Type.STRING },
                  timestamp_seconds: { type: Type.NUMBER },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  screenshot_timestamp_seconds: { type: Type.NUMBER },
                },
                required: ["step_number", "timestamp", "timestamp_seconds", "title", "description", "screenshot_timestamp_seconds"]
              },
            },
          },
          required: ["title", "language", "steps"],
        },
      },
    });

    if (!response.text) {
      throw new Error("Geminiからの応答がありません。");
    }

    const data = JSON.parse(response.text) as ManualData;
    
    // Enrich with IDs
    data.steps = data.steps.map(step => ({
      ...step,
      id: generateId()
    }));

    return data;
  } catch (e: any) {
    console.error("Gemini Generation Error:", e);
    throw new Error(`コンテンツの生成に失敗しました: ${e.message || "不明なエラー"}`);
  }
}

/**
 * Translates an existing manual to a new language.
 */
export async function translateManual(
  data: ManualData,
  targetLanguage: string
): Promise<ManualData> {
  const apiKey = process.env.API_KEY ? process.env.API_KEY.trim() : "";
  const viaProxy = useProxy();
  if (!viaProxy && !apiKey) {
    throw new Error("APIキーが見つかりません。");
  }

  const ai = new GoogleGenAI({
    apiKey: viaProxy ? " " : apiKey,
    ...(viaProxy && typeof window !== "undefined" && { httpOptions: { baseUrl: window.location.origin + "/api-proxy" } }),
  });
  
  const dataForTranslation = {
    title: data.title,
    language: targetLanguage,
    steps: data.steps.map(s => ({
       step_number: s.step_number,
       timestamp: s.timestamp,
       timestamp_seconds: s.timestamp_seconds,
       title: s.title,
       description: s.description,
       screenshot_timestamp_seconds: s.screenshot_timestamp_seconds
    }))
  };

  const prompt = `
    You are a professional translator.
    Translate the following procedure manual content into ${targetLanguage}.
    
    Rules:
    1. Translate the 'title' of the manual.
    2. Translate the 'title' and 'description' of each step.
    3. Do NOT translate timestamps or step numbers.
    4. Maintain the exact JSON structure.
    
    Input JSON:
    ${JSON.stringify(dataForTranslation)}
  `;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        { text: prompt },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            language: { type: Type.STRING },
            steps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  step_number: { type: Type.INTEGER },
                  timestamp: { type: Type.STRING },
                  timestamp_seconds: { type: Type.NUMBER },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  screenshot_timestamp_seconds: { type: Type.NUMBER },
                },
                required: ["step_number", "timestamp", "timestamp_seconds", "title", "description", "screenshot_timestamp_seconds"]
              },
            },
          },
          required: ["title", "language", "steps"],
        },
      },
    });

    if (!response.text) {
      throw new Error("Geminiからの応答がありません。");
    }

    const translatedData = JSON.parse(response.text) as ManualData;
    translatedData.language = targetLanguage;
    
    // Enrich with IDs
    translatedData.steps = translatedData.steps.map(step => ({
      ...step,
      id: generateId()
    }));

    return translatedData;
  } catch (e: any) {
    console.error("Translation Error:", e);
    throw new Error(`翻訳に失敗しました: ${e.message || "不明なエラー"}`);
  }
}