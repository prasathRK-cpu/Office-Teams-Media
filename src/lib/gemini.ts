import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generatePostContent(title: string, category: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are a professional internal communications officer for 'Nexus', a premium technology company. 
      Generate a professional, engaging, and clear post body for the following title: "${title}". 
      The category is "${category}".
      Keep the tone professional yet approachable. 
      Use markdown for formatting if needed (bullet points, bold text).
      Do not include the title in the response. Just the body content.`,
    });

    return response.text;
  } catch (error) {
    console.error("Gemini AI Error:", error);
    throw error;
  }
}

export async function refineContent(content: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Refine and polish the following internal company post to make it more professional, scannable, and engaging. 
      Fix any grammar issues and improve the flow. Use professional company language.
      Content: "${content}"
      Return only the refined content.`,
    });

    return response.text;
  } catch (error) {
    console.error("Gemini AI Refinement Error:", error);
    throw error;
  }
}
