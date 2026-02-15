import { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, Footer, PageNumber, AlignmentType } from "docx";
import { ManualData } from "../types";

// Helper to get image dimensions from a base64 string or URL
const getImageDimensions = (src: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = (e) => {
      reject(e);
    };
    img.src = src;
  });
};

export const generateDocx = async (data: ManualData): Promise<Blob> => {
  // Always favor a CJK-friendly font if possibly Japanese or other asian languages
  const isCJK = true; // For this version we default to CJK support as primary target is JP
  const mainFont = "Yu Gothic";
  
  const children: (Paragraph)[] = [
    new Paragraph({
      text: data.title,
      heading: HeadingLevel.TITLE,
      spacing: { after: 400 },
      style: "Title",
    }),
    new Paragraph({
      text: "目次", // Table of Contents
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
    }),
    // Simple TOC placeholder since dynamic TOC fields are complex in client-side generation without specialized runners
    // We list steps as a summary.
    ...data.steps.map(step => new Paragraph({
      text: `${step.step_number}. ${step.title}`,
      bullet: { level: 0 },
      spacing: { after: 100 },
    })),
    // Removed forced page break here to save space
    new Paragraph({
      text: "",
      spacing: { after: 400 }, // Just some spacing instead of a full page break
    }),
  ];

  for (const step of data.steps) {
    // Step Title
    children.push(
      new Paragraph({
        text: `手順 ${step.step_number}: ${step.title}`,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 200 },
      })
    );

    // Step Description
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: step.description,
            font: mainFont,
            size: 22, // 11pt
          }),
        ],
        spacing: { after: 200 },
      })
    );

    // Screenshot
    if (step.screenshot_data) {
      try {
        const imageResponse = await fetch(step.screenshot_data);
        const imageBlob = await imageResponse.blob();
        const imageBuffer = await imageBlob.arrayBuffer();

        // Calculate aspect ratio to fit within a reasonable width (e.g., 400px or 450px)
        const dimensions = await getImageDimensions(step.screenshot_data);
        const maxDocWidth = 450;
        const aspectRatio = dimensions.width / dimensions.height;
        
        const finalWidth = maxDocWidth;
        const finalHeight = maxDocWidth / aspectRatio;

        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: imageBuffer,
                transformation: {
                  width: finalWidth,
                  height: finalHeight,
                },
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          })
        );
      } catch (e) {
        console.error("Failed to add image to docx", e);
      }
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: mainFont,
          },
        },
      },
      paragraphStyles: [
        {
            id: "Title",
            name: "Title",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: {
                size: 36, // 18pt
                bold: true,
                color: "1F4788",
            },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: {
            size: 28, // 14pt
            bold: true,
            color: "333333",
          },
        },
      ],
    },
    sections: [
      {
        properties: {},
        children: children,
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun("- "),
                  PageNumber.CURRENT,
                  new TextRun(" / "),
                  PageNumber.TOTAL_PAGES,
                  new TextRun(" -"),
                ],
              }),
            ],
          }),
        },
      },
    ],
  });

  return await Packer.toBlob(doc);
};