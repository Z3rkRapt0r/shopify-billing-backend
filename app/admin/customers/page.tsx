'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { SyncProgressDialog } from '@/components/SyncProgressDialog';

interface SyncEvent {
  timestamp: Date;
  message: string;
  type: 'info' | 'success' | 'error';
}

interface User {
  id: string;
  shopifyCustomerId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  countryCode?: string;
  createdAt: string;
  billingProfile?: {
    id: string;
    companyName?: string;
    vatNumber?: string;
    taxCode?: string;
    isBusiness: boolean;
  };
}

export default function CustomersPage() {
  const [adminPassword, setAdminPassword] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isBusinessFilter, setIsBusinessFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [markingBusiness, setMarkingBusiness] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Stati per Timeline Real-Time
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [syncProgress, setSyncProgress] = useState({
    totalProcessed: 0,
    businessSynced: 0,
    privateSkipped: 0,
    currentBatch: 0,
    estimatedTotal: 0,
    isComplete: false,
  });
  const [syncEvents, setSyncEvents] = useState<SyncEvent[]>([]);

  // Recupera password da sessionStorage
  useEffect(() => {
    const savedPassword = sessionStorage.getItem('adminPassword');
    if (savedPassword) {
      setAdminPassword(savedPassword);
    } else {
      // Redirect al login se non autenticato
      window.location.href = '/admin';
    }
  }, []);

  // Carica clienti solo se autenticato
  useEffect(() => {
    if (adminPassword) {
      loadCustomers();
    }
  }, [page, search, isBusinessFilter, adminPassword]);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '20');
      
      if (search) {
        params.append('search', search);
      }
      
      if (isBusinessFilter !== null) {
        params.append('isBusiness', isBusinessFilter);
      }

      const response = await fetch(`/api/admin/mark-business?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${adminPassword}`,
        },
      });

      if (!response.ok) {
        throw new Error('Errore nel caricamento clienti');
      }

      const data = await response.json();
      setUsers(data.users || []);
      setTotalPages(data.pagination?.pages || 1);
    } catch (err) {
      console.error('Error loading customers:', err);
      setError('Errore nel caricamento clienti');
    } finally {
      setLoading(false);
    }
  };

  const addSyncEvent = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setSyncEvents(prev => [...prev, { timestamp: new Date(), message, type }]);
  };

  const handleSyncCustomers = async () => {
    if (!confirm('🚀 Vuoi analizzare e sincronizzare TUTTI i clienti Business da Shopify?\n\n⏱️  Per oltre 1000 clienti, l\'operazione può richiedere 10-15 minuti.\n\n📊 Vedrai il progresso in tempo reale.')) {
      return;
    }

    // Reset stati e mostra dialog
    setSyncing(true);
    setShowSyncDialog(true);
    setSyncProgress({
      totalProcessed: 0,
      businessSynced: 0,
      privateSkipped: 0,
      currentBatch: 0,
      estimatedTotal: 0,
      isComplete: false,
    });
    setSyncEvents([]);

    addSyncEvent('🎬 Avvio sincronizzazione...', 'info');

    try {
      let totalSynced = 0;
      let totalProcessed = 0;
      let totalSkipped = 0;
      let hasMore = true;
      let pageInfo: string | undefined = undefined;
      let batchNumber = 0;
      const MAX_BATCHES = 60; // Limite di sicurezza: 60 batch × 25 clienti = 1500 clienti max

      addSyncEvent('🔍 Avvio sincronizzazione con cursor pagination...', 'info');
      
      // Continua finché ci sono altri clienti
      while (hasMore && batchNumber < MAX_BATCHES) {
        batchNumber++;
        addSyncEvent(`📦 Elaborazione batch #${batchNumber}...`, 'info');

        const response: Response = await fetch('/api/admin/sync-customers', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${adminPassword}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            limit: 25, // Ridotto per evitare timeout 30s
            page_info: pageInfo,
          }),
        });

        if (!response.ok) {
          throw new Error('Errore durante la sincronizzazione');
        }

        const data = await response.json();
        
        // 🔍 DEBUG: Log risposta backend
        console.log(`📥 Batch #${batchNumber} risposta:`, {
          syncedCount: data.syncedCount,
          processedCount: data.processedCount,
          skippedCount: data.skippedCount,
          hasMore: data.hasMore,
          pageInfo: data.pageInfo ? 'presente' : 'assente',
          loopDetected: data.loopDetected,
        });
        
        // 🚨 RILEVAMENTO LOOP dal backend
        if (data.loopDetected) {
          addSyncEvent(`🚨 LOOP RILEVATO! Stessi clienti processati più volte. Sincronizzazione fermata.`, 'error');
          console.error(`🚨 Loop detection: backend ha fermato la sincronizzazione`);
          break;
        }
        
        // Accumula statistiche
        totalSynced += data.syncedCount || 0;
        totalProcessed += data.processedCount || 0;
        totalSkipped += data.skippedCount || 0;
        
        hasMore = data.hasMore;
        pageInfo = data.pageInfo;
        
        console.log(`   ➡️  hasMore=${hasMore}, continua=${hasMore ? 'SÌ' : 'NO'}, pageInfo=${pageInfo ? 'presente' : 'assente'}`);

        // Aggiorna progresso in tempo reale
        setSyncProgress({
          totalProcessed,
          businessSynced: totalSynced,
          privateSkipped: totalSkipped,
          currentBatch: batchNumber,
          estimatedTotal: hasMore ? totalProcessed + 50 : totalProcessed, // Stima dinamica
          isComplete: false,
        });

        // Log eventi
        if (data.syncedCount > 0) {
          addSyncEvent(
            `✅ Batch #${batchNumber}: ${data.syncedCount} clienti Business sincronizzati, ${data.skippedCount} privati saltati`,
            'success'
          );
        } else {
          addSyncEvent(
            `⏭️  Batch #${batchNumber}: ${data.skippedCount} clienti privati saltati (nessun Business)`,
            'info'
          );
        }

        // Se non ci sono più clienti, fermati
        if (!hasMore) {
          addSyncEvent(`🏁 Tutti i clienti sono stati analizzati!`, 'success');
          break;
        }
        
        // Verifica limite di sicurezza batch
        if (batchNumber >= MAX_BATCHES) {
          addSyncEvent(`⚠️  Raggiunto limite di sicurezza (${MAX_BATCHES} batch). Contatta supporto se hai più di 2500 clienti.`, 'error');
          break;
        }
        
        // Verifica se stiamo processando troppi clienti (possibile loop)
        if (totalProcessed > 1500) {
          addSyncEvent(`⚠️  ATTENZIONE: Processati ${totalProcessed} clienti. Possibile loop! Fermato per sicurezza.`, 'error');
          console.error(`Loop detection: ${totalProcessed} clienti processati, troppi!`);
          break;
        }

        // Pausa tra i batch per rate limiting (aumentato per 429)
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Completa sincronizzazione
      setSyncProgress(prev => ({
        ...prev,
        isComplete: true,
        estimatedTotal: totalProcessed,
      }));

      addSyncEvent(
        `🎉 Sincronizzazione completata! ${totalSynced} Business, ${totalSkipped} privati, ${batchNumber} batch`,
        'success'
      );
      
      // Ricarica la lista clienti dopo 2 secondi
      setTimeout(() => {
        loadCustomers();
      }, 2000);

    } catch (err) {
      console.error('Error syncing customers:', err);
      addSyncEvent(`❌ Errore: ${err instanceof Error ? err.message : 'Errore sconosciuto'}`, 'error');
      setSyncProgress(prev => ({ ...prev, isComplete: true }));
    } finally {
      setSyncing(false);
    }
  };

  const handleMarkAsBusiness = async (shopifyCustomerId: string, isBusiness: boolean) => {
    setMarkingBusiness(shopifyCustomerId);
    try {
      const response = await fetch('/api/admin/mark-business', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminPassword}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shopifyCustomerId,
          isBusiness,
          // Aggiungi dati di fatturazione se stai impostando come business
          ...(isBusiness && {
            vatNumber: 'IT01234567890', // Valore di default
            taxCode: 'RSSMRA80A01H501U', // Valore di default
            pec: 'fatturazione@pec.it', // Valore di default
            sdiCode: '0000000', // Valore di default
          }),
        }),
      });

      if (!response.ok) {
        throw new Error('Errore durante aggiornamento stato cliente');
      }

      // Ricarica la lista clienti
      loadCustomers();
    } catch (err) {
      console.error('Error marking customer as business:', err);
      alert('Errore durante aggiornamento stato cliente');
    } finally {
      setMarkingBusiness(null);
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1); // Resetta alla prima pagina
  };

  const handleFilter = (filter: string | null) => {
    setIsBusinessFilter(filter === isBusinessFilter ? null : filter);
    setPage(1); // Resetta alla prima pagina
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Gestione Clienti
          </h1>
          <p className="mt-2 text-gray-600">
            Visualizza e gestisci i clienti sincronizzati da Shopify
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* Actions */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Azioni Rapide</CardTitle>
            <CardDescription>
              Operazioni di gestione clienti
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <Button 
                onClick={handleSyncCustomers}
                disabled={syncing}
                variant="outline"
              >
                {syncing ? 'Sincronizzazione...' : 'Sincronizza Clienti Shopify'}
              </Button>
              <Button 
                onClick={() => window.location.href = '/admin/orders'}
                variant="outline"
              >
                Gestione Ordini
              </Button>
              <Button 
                onClick={() => window.location.href = '/admin/credit-notes'}
                variant="outline"
              >
                Note di Credito
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Filtri</CardTitle>
            <CardDescription>
              Filtra clienti per stato o ricerca
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 mb-4">
              <Input
                placeholder="Cerca per email o nome..."
                value={search}
                onChange={handleSearch}
                className="max-w-md"
              />
              <div className="flex gap-2">
                <Button
                  variant={isBusinessFilter === 'true' ? 'default' : 'outline'}
                  onClick={() => handleFilter('true')}
                >
                  Business
                </Button>
                <Button
                  variant={isBusinessFilter === 'false' ? 'default' : 'outline'}
                  onClick={() => handleFilter('false')}
                >
                  Privati
                </Button>
                <Button
                  variant={isBusinessFilter === null ? 'default' : 'outline'}
                  onClick={() => handleFilter(null)}
                >
                  Tutti
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Customers Table */}
        <Card>
          <CardHeader>
            <CardTitle>Clienti ({users.length})</CardTitle>
            <CardDescription>
              Pagina {page} di {totalPages}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Caricamento clienti...</p>
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Nessun cliente trovato
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Paese</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Profilo Fatturazione</TableHead>
                    <TableHead>Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        {user.email}
                      </TableCell>
                      <TableCell>
                        {user.firstName} {user.lastName}
                      </TableCell>
                      <TableCell>
                        {user.countryCode}
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.billingProfile?.isBusiness ? 'success' : 'secondary'}>
                          {user.billingProfile?.isBusiness ? 'Business' : 'Privato'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.billingProfile ? (
                          <div className="text-sm">
                            {user.billingProfile.companyName && (
                              <div><strong>Azienda:</strong> {user.billingProfile.companyName}</div>
                            )}
                            {user.billingProfile.vatNumber && (
                              <div><strong>P.IVA:</strong> {user.billingProfile.vatNumber}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-500">Nessun profilo</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          {!user.billingProfile?.isBusiness && (
                            <Button
                              size="sm"
                              onClick={() => handleMarkAsBusiness(user.shopifyCustomerId, true)}
                              disabled={markingBusiness === user.shopifyCustomerId}
                            >
                              {markingBusiness === user.shopifyCustomerId ? 'Impostando...' : 'Imposta Business'}
                            </Button>
                          )}
                          {user.billingProfile?.isBusiness && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleMarkAsBusiness(user.shopifyCustomerId, false)}
                              disabled={markingBusiness === user.shopifyCustomerId}
                            >
                              {markingBusiness === user.shopifyCustomerId ? 'Impostando...' : 'Imposta Privato'}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center mt-8 space-x-2">
            <Button
              variant="outline"
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 1}
            >
              Precedente
            </Button>
            <span className="px-4 py-2 text-sm text-gray-700">
              Pagina {page} di {totalPages}
            </span>
            <Button
              variant="outline"
              onClick={() => handlePageChange(page + 1)}
              disabled={page === totalPages}
            >
              Successivo
            </Button>
          </div>
        )}
      </div>

      {/* Dialog Timeline Real-Time */}
      <SyncProgressDialog
        isOpen={showSyncDialog}
        totalProcessed={syncProgress.totalProcessed}
        businessSynced={syncProgress.businessSynced}
        privateSkipped={syncProgress.privateSkipped}
        currentBatch={syncProgress.currentBatch}
        estimatedTotal={syncProgress.estimatedTotal}
        events={syncEvents}
        isComplete={syncProgress.isComplete}
      />
    </div>
  );
}