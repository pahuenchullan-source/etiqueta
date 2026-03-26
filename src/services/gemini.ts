import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface SurgicalData {
  paciente: string;
  cirugia: string;
  ojo: string;
  insumoEspecial: string;
  medico: string;
}

export async function extractSurgicalData(base64Pdf: string): Promise<SurgicalData[]> {
  const model = "gemini-3.1-pro-preview"; // Using a more capable model for complex tables
  
  const prompt = `
    Analiza este documento PDF. Es una programación de cirugías.
    Tu tarea es identificar la tabla o lista de pacientes y extraer sus datos.
    
    Busca columnas o filas que se parezcan a:
    - Nombres de personas (Pacientes)
    - Procedimientos médicos (ej: Faco, Vitrectomía, Catarata, Chalazión, etc.)
    - Médicos (ej: Dr. X, Cirujano Y)
    - Ojos (Derecho, Izquierdo, OD, OI)

    Extrae la información para CADA paciente:
    - paciente: Nombre (Primer Nombre + Primer Apellido).
    - cirugia: Tipo de cirugía. ABREVIA SIEMPRE (ej: 'Facoemulsificación' -> 'FACO', 'Vitrectomía' -> 'VIT', 'Inyección' -> 'INJ', 'Catarata' -> 'CAT').
    - ojo: Ojo (Derecho, Izquierdo, Ambos, o N/A).
    - insumoEspecial: Lente, prótesis o equipo especial (Abreviado).
    - medico: Nombre del cirujano (Ej: 'Dr. Apellido').

    REGLAS CRÍTICAS:
    1. Ignora encabezados de página o texto irrelevante.
    2. Si el PDF tiene varias tablas, procésalas todas.
    3. Si un dato es difícil de leer, haz tu mejor esfuerzo basado en el contexto médico.
    4. Responde ÚNICAMENTE con el arreglo JSON.
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: "application/pdf",
                data: base64Pdf,
              },
            },
            { text: prompt },
          ],
        },
      ],
      config: {
        systemInstruction: "Eres un experto en extracción de datos de documentos médicos y tablas quirúrgicas. Tu objetivo es extraer datos precisos y estructurarlos en JSON.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              paciente: { type: Type.STRING },
              cirugia: { type: Type.STRING },
              ojo: { type: Type.STRING },
              insumoEspecial: { type: Type.STRING },
              medico: { type: Type.STRING },
            },
            required: ["paciente", "cirugia", "ojo", "insumoEspecial", "medico"],
          },
        },
      },
    });

    const text = response.text?.trim();
    if (!text) {
      console.error("Gemini returned empty response");
      throw new Error("No se pudo extraer información del documento.");
    }

    // Attempt to clean JSON if model included markdown blocks despite instructions
    const cleanJson = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error("Detailed Gemini Error:", error);
    if (error instanceof Error && error.message.includes("API_KEY_INVALID")) {
      throw new Error("Error de configuración: La clave de API no es válida en Vercel.");
    }
    throw new Error("No se pudo reconocer la tabla en el PDF. Asegúrate de que el archivo sea legible y contenga datos quirúrgicos.");
  }
}
