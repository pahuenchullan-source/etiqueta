import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export interface SurgicalData {
  paciente: string;
  cirugia: string;
  ojo: string;
  insumoEspecial: string;
  medico: string;
}

export async function extractSurgicalData(base64Pdf: string): Promise<SurgicalData[]> {
  if (!apiKey) {
    throw new Error("Error de configuración: No se ha detectado la clave de API (GEMINI_API_KEY). Por favor, configúrala en Vercel.");
  }
  const model = "gemini-3.1-pro-preview"; // Using a more capable model for complex tables
    const prompt = `
      ACTÚA COMO UN EXPERTO EN OCR Y EXTRACCIÓN DE DATOS OFTALMOLÓGICOS.
      Tu objetivo es encontrar la tabla de programación de cirugías en este PDF y extraer la lista de pacientes.
      
      INSTRUCCIONES DE BÚSQUEDA:
      1. Identifica las columnas de: Paciente, Cirugía/Procedimiento, Ojo (OD, OI, Ambos), Médico/Cirujano e Insumos/Lentes.
      2. No te dejes confundir por encabezados, logos o texto lateral.
      3. Si el documento es una imagen o escaneo de mala calidad, usa tu conocimiento médico para deducir las palabras.

      ABREVIATURAS OBLIGATORIAS PARA 'cirugia':
      - 'Facoemulsificación' -> 'FACO'
      - 'Vitrectomía' -> 'VIT'
      - 'Inyección Intravítrea' -> 'INJ'
      - 'Catarata' -> 'CAT'
      - 'Pterigión' -> 'PTE'
      - 'Chalazión' -> 'CHA'
      - 'Desprendimiento de Retina' -> 'DR'
      - 'Evisceración' -> 'EVI'
      - 'Enucleación' -> 'ENU'
      - 'Trabeculectomía' -> 'TRAB'

      DATOS A EXTRAER POR CADA FILA DE LA TABLA:
      - paciente: Nombre Completo (o Primer Nombre + Apellido).
      - cirugia: Nombre de la cirugía (USA LAS ABREVIATURAS).
      - ojo: Ojo (Derecho, Izquierdo, Ambos, o N/A).
      - insumoEspecial: Lente intraocular (ej: Monofocal, Toric), gas, aceite o equipo especial (Abreviado).
      - medico: Nombre del cirujano (Ej: 'Dr. Apellido').

      REGLAS DE SALIDA:
      - Responde EXCLUSIVAMENTE con un arreglo JSON.
      - Si no encuentras NINGÚN paciente, devuelve un arreglo vacío [].
      - No incluyas explicaciones ni bloques de código markdown.
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
          systemInstruction: "Eres un sistema especializado en convertir tablas de programación quirúrgica PDF a datos estructurados JSON. Eres extremadamente preciso y capaz de leer tablas complejas o escaneadas.",
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
        throw new Error("El modelo no devolvió ningún dato.");
      }

      const results = JSON.parse(text.replace(/^```json\n?/, "").replace(/\n?```$/, ""));
      
      if (results.length === 0) {
        throw new Error("No se encontraron pacientes o una tabla quirúrgica válida en el documento.");
      }

      return results;
    } catch (error) {
      console.error("Detailed Gemini Error:", error);
      
      let friendlyMessage = "No se pudo reconocer la tabla en el PDF. Asegúrate de que el archivo sea legible y contenga datos quirúrgicos.";
      
      if (error instanceof Error) {
        if (error.message.includes("API_KEY_INVALID")) {
          friendlyMessage = "Error de configuración: La clave de API no es válida en Vercel.";
        } else if (error.message.includes("No se encontraron pacientes")) {
          friendlyMessage = error.message;
        } else {
          // Include the original error for debugging if it's not a generic one
          friendlyMessage += ` (Detalle: ${error.message})`;
        }
      }
      
      throw new Error(friendlyMessage);
    }
}
