'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

interface SyncEvent {
  timestamp: Date;
  message: string;
  type: 'info' | 'success' | 'error';
}

interface SyncProgressProps {
  isOpen: boolean;
  totalProcessed: number;
  businessSynced: number;
  privateSkipped: number;
  currentBatch: number;
  estimatedTotal: number;
  events: SyncEvent[];
  isComplete: boolean;
}

export function SyncProgressDialog({
  isOpen,
  totalProcessed,
  businessSynced,
  privateSkipped,
  currentBatch,
  estimatedTotal,
  events,
  isComplete,
}: SyncProgressProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (estimatedTotal > 0) {
      const newProgress = Math.min((totalProcessed / estimatedTotal) * 100, 100);
      setProgress(newProgress);
    }
  }, [totalProcessed, estimatedTotal]);

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isComplete ? '✅ Sincronizzazione Completata!' : '🔄 Sincronizzazione Clienti in Corso...'}
          </DialogTitle>
          <DialogDescription>
            {isComplete 
              ? 'Tutti i clienti Business sono stati sincronizzati con successo'
              : 'Analisi e sincronizzazione di tutti i clienti Shopify'}
          </DialogDescription>
        </DialogHeader>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Progresso: {totalProcessed} / {estimatedTotal > 0 ? estimatedTotal : '???'} clienti</span>
            <span>{progress.toFixed(1)}%</span>
          </div>
          <Progress value={progress} className="h-3" />
        </div>

        {/* Statistiche Real-Time */}
        <div className="grid grid-cols-3 gap-4 py-4">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="text-2xl font-bold text-blue-700">{totalProcessed}</div>
            <div className="text-sm text-blue-600">Clienti Analizzati</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <div className="text-2xl font-bold text-green-700">{businessSynced}</div>
            <div className="text-sm text-green-600">Business Sincronizzati</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="text-2xl font-bold text-gray-700">{privateSkipped}</div>
            <div className="text-sm text-gray-600">Privati Saltati</div>
          </div>
        </div>

        {/* Batch Info */}
        <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-purple-700">
              📦 Batch Corrente: #{currentBatch}
            </span>
            <span className="text-xs text-purple-600">
              {isComplete ? 'Completato' : 'In elaborazione...'}
            </span>
          </div>
        </div>

        {/* Timeline Eventi */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">📋 Timeline Eventi</h3>
          <div className="flex-1 overflow-y-auto border rounded-lg bg-gray-50 p-3 space-y-2">
            {events.length === 0 ? (
              <div className="text-center text-gray-400 py-4">
                Nessun evento ancora...
              </div>
            ) : (
              events.map((event, index) => (
                <div
                  key={index}
                  className={`text-xs p-2 rounded border-l-4 ${
                    event.type === 'success'
                      ? 'bg-green-50 border-green-500 text-green-800'
                      : event.type === 'error'
                      ? 'bg-red-50 border-red-500 text-red-800'
                      : 'bg-blue-50 border-blue-500 text-blue-800'
                  }`}
                >
                  <span className="font-mono text-[10px] text-gray-500">
                    {event.timestamp.toLocaleTimeString()}
                  </span>
                  {' - '}
                  <span>{event.message}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Performance Metrics */}
        {isComplete && (
          <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-4 border border-green-200">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-gray-700">
                🎉 Sincronizzazione completata con successo!
              </span>
              <span className="text-gray-600">
                {businessSynced > 0 
                  ? `${((businessSynced / totalProcessed) * 100).toFixed(1)}% clienti Business`
                  : 'Nessun cliente Business trovato'}
              </span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

