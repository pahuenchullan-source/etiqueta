/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { Upload, FileText, User, Activity, Eye, Package, UserRound, Loader2, CheckCircle2, AlertCircle, Copy, Printer, Check, Download, Table } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { extractSurgicalData, SurgicalData } from './services/gemini';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [results, setResults] = useState<SurgicalData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleFile = async (selectedFile: File) => {
    if (selectedFile.type !== 'application/pdf') {
      setError('Por favor, sube un archivo PDF válido.');
      return;
    }
    setFile(selectedFile);
    setError(null);
    setResults(null);
    
    // Start extraction automatically
    processFile(selectedFile);
  };

  const generateEPL2Single = (data: SurgicalData, xOffset = 20) => {
    // EPL2 commands for TLP-2844 (203 DPI)
    // A[x],[y],[rotation],[font],[h_mult],[v_mult],[reverse],"text"
    const truncate = (str: string, max: number) => str.length > max ? str.substring(0, max) : str;
    
    return [
      `A${xOffset},15,0,2,1,1,N,"PAC: ${truncate(data.paciente.toUpperCase(), 32)}"`,
      `A${xOffset},55,0,2,1,1,N,"CIR: ${truncate(data.cirugia.toUpperCase(), 35)}"`,
      `A${xOffset},95,0,2,1,1,N,"OJO: ${data.ojo.toUpperCase()}"`,
      `A${xOffset},135,0,2,1,1,N,"INS: ${truncate(data.insumoEspecial.toUpperCase(), 35)}"`,
      `A${xOffset},175,0,2,1,1,N,"MED: ${truncate(data.medico.toUpperCase(), 32)}"`
    ].join('\n');
  };

  const downloadCSV = () => {
    if (!results || results.length === 0) return;

    const headers = ['Paciente', 'Cirugia', 'Ojo', 'InsumoEspecial', 'Medico'];
    const rows = results.map(item => [
      `"${item.paciente}"`,
      `"${item.cirugia}"`,
      `"${item.ojo}"`,
      `"${item.insumoEspecial}"`,
      `"${item.medico}"`
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');
    // Add UTF-8 BOM for Excel and older software compatibility
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `datos_quirurgicos_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadBulkLabels = () => {
    if (!results || results.length === 0) return;

    let eplContent = [
      'N',
      'q856',      // Ancho de etiqueta (10.7cm)
      'Q240,24',   // Largo de etiqueta (3cm) + Gap (3mm)
      'S2',        // Velocidad de impresión
      'D10',       // Densidad/Oscuridad
      'ZT',        // Imprimir desde arriba
    ];

    for (let i = 0; i < results.length; i += 2) {
      eplContent.push('N');
      eplContent.push(generateEPL2Single(results[i], 20));
      if (results[i + 1]) {
        eplContent.push(generateEPL2Single(results[i + 1], 450)); // Segunda columna
      }
      eplContent.push('P1');
    }

    const blob = new Blob([eplContent.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `comandos_impresion_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = (data: SurgicalData, idx: number) => {
    const epl = [
      'N',
      'q856',
      'Q240,24',
      'S2',
      'D10',
      'ZT',
      'N',
      generateEPL2Single(data, 20),
      'P1'
    ].join('\n');
    navigator.clipboard.writeText(epl).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const onDragLeave = () => {
    setDragActive(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const processFile = async (fileToProcess: File) => {
    setIsExtracting(true);
    setError(null);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(fileToProcess);
      const base64 = await base64Promise;

      const data = await extractSurgicalData(base64);
      setResults(data);
    } catch (err) {
      setError('Hubo un error al procesar el archivo. Asegúrate de que sea una tabla quirúrgica legible.');
      console.error(err);
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto">
      <header className="mb-12 text-center md:text-left">
        <motion.h1 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-bold tracking-tight text-zinc-900 mb-2"
        >
          Extractor de Tabla Quirúrgica
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-zinc-500 text-lg"
        >
          Sube tu programación quirúrgica en PDF para extraer datos y generar etiquetas Zebra.
        </motion.p>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Upload Section */}
        <div className="lg:col-span-5 space-y-6">
          <div 
            className={`relative group cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-300 p-12 text-center flex flex-col items-center justify-center gap-4
              ${dragActive ? 'border-blue-500 bg-blue-50/50' : 'border-zinc-200 hover:border-zinc-300 bg-white'}
              ${file ? 'border-green-500 bg-green-50/10' : ''}
            `}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <input 
              id="file-input"
              type="file" 
              className="hidden" 
              accept="application/pdf"
              onChange={handleFileInput}
            />
            
            <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors
              ${file ? 'bg-green-100 text-green-600' : 'bg-zinc-100 text-zinc-400 group-hover:bg-zinc-200'}
            `}>
              {file ? <CheckCircle2 size={32} /> : <Upload size={32} />}
            </div>

            <div>
              <p className="font-semibold text-zinc-900">
                {file ? file.name : 'Haz clic o arrastra el PDF aquí'}
              </p>
              <p className="text-sm text-zinc-500 mt-1">
                Solo archivos PDF de tablas quirúrgicas
              </p>
            </div>

            {file && isExtracting && (
              <div className="mt-4 w-full py-3 px-6 bg-zinc-100 text-zinc-900 rounded-xl font-medium flex items-center justify-center gap-2">
                <Loader2 className="animate-spin" size={20} />
                Procesando automáticamente...
              </div>
            )}
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700"
            >
              <AlertCircle className="shrink-0 mt-0.5" size={18} />
              <p className="text-sm font-medium">{error}</p>
            </motion.div>
          )}

          <div className="p-6 glass-panel rounded-2xl">
            <h3 className="text-sm font-semibold text-zinc-900 uppercase tracking-wider mb-4">Uso con ZebraDesigner 2.5.0 (9425)</h3>
            <ul className="space-y-3 text-sm text-zinc-600">
              <li className="flex gap-2">
                <span className="text-green-600 font-bold">1. Llenado Automático (Recomendado):</span>
                Descarga el <strong>CSV</strong>. En ZebraDesigner 2.5.0, ve a <strong>Base de Datos &gt; Conectar</strong> y selecciona el archivo. <br/>
                <span className="text-xs text-zinc-500 italic">Esto permite que tu diseño actual se llene con todos los pacientes del PDF automáticamente.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-600 font-bold">2. Impresión Directa:</span>
                Usa <strong>"Descargar Comandos (.txt)"</strong> y envíalo vía <em>Zebra Setup Utilities</em>.
              </li>
              <li className="flex gap-2">
                <span className="text-zinc-400 font-bold">3. Copiar Código:</span>
                Usa <strong>"Copiar EPL2"</strong> para imprimir un paciente rápido.
              </li>
            </ul>
          </div>
        </div>

        {/* Results Section */}
        <div className="lg:col-span-7">
          <AnimatePresence mode="wait">
            {isExtracting ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 space-y-4"
              >
                <div className="relative">
                  <Loader2 className="animate-spin text-zinc-300" size={64} strokeWidth={1} />
                  <Activity className="absolute inset-0 m-auto text-zinc-900" size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-zinc-900">Analizando tabla quirúrgica</h3>
                  <p className="text-zinc-500 max-w-xs mx-auto mt-2">
                    Estamos identificando pacientes, médicos e insumos especiales...
                  </p>
                </div>
              </motion.div>
            ) : results ? (
              <motion.div 
                key="results"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
                    <FileText size={20} />
                    Resultados Extraídos ({results.length})
                  </h2>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={downloadCSV}
                      className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-xl text-xs font-bold hover:bg-green-700 transition-colors shadow-sm"
                    >
                      <Table size={14} />
                      Descargar CSV
                    </button>
                    <button 
                      onClick={downloadBulkLabels}
                      className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm"
                    >
                      <Download size={14} />
                      Descargar Comandos (.txt)
                    </button>
                    <button 
                      onClick={() => { setResults(null); setFile(null); }}
                      className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors ml-2"
                    >
                      Limpiar
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  {results.map((item, idx) => (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="glass-panel rounded-2xl overflow-hidden"
                    >
                      <div className="p-5 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-white border border-zinc-200 flex items-center justify-center text-zinc-900">
                            <User size={20} />
                          </div>
                          <div>
                            <h4 className="font-bold text-zinc-900">{item.paciente}</h4>
                            <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">Paciente</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => copyToClipboard(item, idx)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                              ${copiedIdx === idx 
                                ? 'bg-green-600 text-white' 
                                : 'bg-zinc-900 text-white hover:bg-zinc-800'}
                            `}
                          >
                            {copiedIdx === idx ? (
                              <>
                                <Check size={14} />
                                Copiado
                              </>
                            ) : (
                              <>
                                <Printer size={14} />
                                Copiar EPL2
                              </>
                            )}
                          </button>
                          <div className="px-3 py-1 bg-zinc-100 text-zinc-600 text-[10px] font-bold uppercase tracking-widest rounded-full border border-zinc-200">
                            {item.ojo}
                          </div>
                        </div>
                      </div>

                      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Activity size={12} />
                            Cirugía
                          </label>
                          <p className="text-sm text-zinc-800 font-medium leading-relaxed">
                            {item.cirugia}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                            <UserRound size={12} />
                            Médico
                          </label>
                          <p className="text-sm text-zinc-800 font-medium">
                            {item.medico}
                          </p>
                        </div>
                        <div className="md:col-span-2 space-y-1">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Package size={12} />
                            Insumo Especial
                          </label>
                          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                            <p className="text-sm text-zinc-700 italic">
                              {item.insumoEspecial}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            ) : (
              <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-zinc-100 rounded-3xl">
                <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center text-zinc-200 mb-4">
                  <FileText size={40} />
                </div>
                <h3 className="text-lg font-medium text-zinc-400">Los resultados aparecerán aquí</h3>
                <p className="text-zinc-400 text-sm mt-1 max-w-xs">
                  Una vez procesado el PDF, podrás descargar un CSV para Zebra Designer o comandos de impresión directa (.txt).
                </p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <footer className="mt-20 pt-8 border-t border-zinc-100 text-center text-zinc-400 text-xs">
        <p>© 2026 Sistema de Gestión Quirúrgica Inteligente. Potenciado por IA.</p>
      </footer>
    </div>
  );
}
