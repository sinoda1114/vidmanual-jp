import { GoogleGenAI, Type } from "@google/genai";
import { ManualData } from "../types";
import { GEMINI_MODEL, SYSTEM_INSTRUCTION } from "../constants";

// Helper to wait
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to generate IDs
const generateId = () => Math.random().toString(36).substring(2, 9);

/**
 * Uploads a file to Google AI Studio via the File API using standard fetch.
 */
export async function uploadFile(file: File, onProgress: (progress: number) => void): Promise<string> {
  const apiKey = process.env.API_KEY ? process.env.API_KEY.trim() : "";
  if (!apiKey) {
    throw new Error("APIキーが見つかりません。");
  }

  const contentType = file.type || "application/octet-stream";

  const metadata = {
    file: {
      display_name: file.name,
      mime_type: contentType,
    },
  };

  try {
    // 1. Initiate Resumable Upload
    const startUploadResponse = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": file.size.toString(),
          "X-Goog-Upload-Header-Content-Type": contentType,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(metadata),
        mode: "cors", // Explicitly set CORS mode
        credentials: "omit", // Omit credentials to avoid CORS issues with wildcards
      }
    );

    if (!startUploadResponse.ok) {
      const errorText = await startUploadResponse.text();
      throw new Error(`アップロードの開始に失敗しました: ${startUploadResponse.statusText} - ${errorText}`);
    }

    const uploadUrl = startUploadResponse.headers.get("X-Goog-Upload-URL");
    if (!uploadUrl) {
      throw new Error("Gemini APIからアップロードURLを取得できませんでした。");
    }

    // Ensure the upload URL has the API key
    const urlWithKey = uploadUrl.includes("key=") 
      ? uploadUrl 
      : `${uploadUrl}${uploadUrl.includes("?") ? "&" : "?"}key=${apiKey}`;

    // Simulate progress
    onProgress(10);

    // 2. Upload the file content
    const uploadResponse = await fetch(urlWithKey, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
        "Content-Type": contentType,
      },
      body: file,
      mode: "cors",
      credentials: "omit",
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`ファイルデータのアップロードに失敗しました: ${uploadResponse.statusText} - ${errorText}`);
    }

    const uploadResult = await uploadResponse.json();
    const fileUri = uploadResult.file.uri;
    const fileName = uploadResult.file.name;

    onProgress(100);

    // 3. Wait for file to be processed
    let state = "PROCESSING";
    while (state === "PROCESSING") {
      await delay(2000);
      try {
        const stateResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`,
          { 
            mode: "cors",
            credentials: "omit" 
          }
        );
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
  if (!apiKey) {
    throw new Error("APIキーが見つかりません。");
  }

  const ai = new GoogleGenAI({ apiKey });
  
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
  if (!apiKey) {
    throw new Error("APIキーが見つかりません。");
  }

  const ai = new GoogleGenAI({ apiKey });
  
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