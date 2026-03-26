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
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    Analiza este documento PDF que contiene una tabla quirúrgica.
    Extrae la siguiente información para cada paciente listado en la tabla:
    - paciente: Nombre del paciente (Si es muy largo, usa el primer nombre y el primer apellido).
    - cirugia: Tipo de cirugía o procedimiento. IMPORTANTE: Usa abreviaturas médicas estándar si el nombre es largo (ej: 'Facoemulsificación' -> 'FACO', 'Vitrectomía' -> 'VIT', 'Inyección' -> 'INJ', 'Desprendimiento de Retina' -> 'DR').
    - ojo: Ojo a intervenir (Derecho, Izquierdo, Ambos, o N/A).
    - insumoEspecial: Insumo especial o equipo específico mencionado (Abreviado si es posible).
    - medico: Nombre del médico cirujano (Ej: 'Dr. Apellido').

    Si algún dato no está presente, usa "No especificado".
    Responde estrictamente en formato JSON como una lista de objetos.
  `;

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

  try {
    const text = response.text;
    if (!text) throw new Error("No se recibió respuesta del modelo.");
    return JSON.parse(text);
  } catch (error) {
    console.error("Error parsing Gemini response:", error);
    throw new Error("Error al procesar los datos del PDF.");
  }
}
