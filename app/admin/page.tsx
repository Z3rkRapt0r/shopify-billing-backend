'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SyncProgressDialog } from '@/components/SyncProgressDialog';

interface SyncEvent {
  timestamp: Date;
  message: string;
  type: 'info' | 'success' | 'error';
}

interface KpiData {
  totalUsers: number;
  businessUsers: number;
  totalOrders: number;
  pendingInvoices: number;
  issuedInvoices: number;
  errorInvoices: number;
  foreignOrders: number;
  corrispettiviOrders: number;
}

interface Order {
  id: string;
  shopifyOrderId: string;
  orderNumber: string;
  currency: string;
  totalPrice: number;
  createdAt: string;
  hasVatProfile: boolean;
  invoiceStatus: 'PENDING' | 'ISSUED' | 'ERROR' | 'FOREIGN' | 'CORRISPETTIVO' | 'CANCELLED';
  invoiceId?: string;
  invoiceDate?: string;
  lastError?: string;
  user: {
    email: string;
    firstName?: string;
    lastName?: string;
    billingProfile?: {
      companyName?: string;
      vatNumber?: string;
      isBusiness: boolean;
    };
  };
}

export default function AdminDashboard() {
  // Stati per autenticazione
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');

  const [kpiData, setKpiData] = useState<KpiData>({
    totalUsers: 0,
    businessUsers: 0,
    totalOrders: 0,
    pendingInvoices: 0,
    issuedInvoices: 0,
    errorInvoices: 0,
    foreignOrders: 0,
    corrispettiviOrders: 0,
  });
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [issuingInvoice, setIssuingInvoice] = useState<string | null>(null);

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
  
  // Ref per controllare lo stop della sincronizzazione
  const stopSyncRef = useRef(false);

  // Recupera password da sessionStorage all'avvio
  useEffect(() => {
    const savedPassword = sessionStorage.getItem('adminPassword');
    if (savedPassword) {
      setAdminPassword(savedPassword);
      setIsAuthenticated(true);
    }
  }, []);

  // Carica dati KPI solo dopo autenticazione
  useEffect(() => {
    if (isAuthenticated) {
      setLoading(true);
      loadKpiData();
      loadRecentOrders();
    }
  }, [isAuthenticated]);

  // Warning prima di lasciare la pagina se sync in corso
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (syncing) {
        e.preventDefault();
        e.returnValue = '⚠️ Sincronizzazione in corso! Se ricarichi la pagina, il processo sarà interrotto.';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [syncing]);

  const loadKpiData = async () => {
    try {
      const response = await fetch('/api/admin/orders/stats', {
        headers: {
          'Authorization': `Bearer ${adminPassword}`,
        },
      });

      if (!response.ok) {
        throw new Error('Errore nel caricamento dati KPI');
      }

      const data = await response.json();
      setKpiData(data);
    } catch (err) {
      console.error('Error loading KPI data:', err);
      setError('Errore nel caricamento dati KPI');
    }
  };

  const loadRecentOrders = async () => {
    try {
      const response = await fetch('/api/admin/orders?limit=10', {
        headers: {
          'Authorization': `Bearer ${adminPassword}`,
        },
      });

      if (!response.ok) {
        throw new Error('Errore nel caricamento ordini');
      }

      const data = await response.json();
      setOrders(data.orders);
      setLoading(false);
    } catch (err) {
      console.error('Error loading orders:', err);
      setError('Errore nel caricamento ordini');
      setLoading(false);
    }
  };

  const addSyncEvent = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setSyncEvents(prev => [...prev, { timestamp: new Date(), message, type }]);
  };

  const handleStopSync = () => {
    if (confirm('⚠️ Sei sicuro di voler fermare la sincronizzazione?\n\nI clienti già sincronizzati rimarranno nel database.')) {
      stopSyncRef.current = true;
      addSyncEvent('🛑 Richiesta di stop ricevuta...', 'info');
    }
  };

  const handleSyncCustomers = async () => {
    if (!confirm('🚀 Vuoi analizzare e sincronizzare TUTTI i clienti Business da Shopify?\n\n⏱️  Per oltre 1000 clienti, l\'operazione può richiedere 10-15 minuti.\n\n📊 Vedrai il progresso in tempo reale.')) {
      return;
    }

    // Reset stati e mostra dialog
    stopSyncRef.current = false; // Reset flag stop
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
      
      // Continua finché ci sono altri clienti (o fino a richiesta di stop)
      while (hasMore && batchNumber < MAX_BATCHES && !stopSyncRef.current) {
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
          estimatedTotal: hasMore ? totalProcessed + 50 : totalProcessed,
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

      // Messaggio finale (diverso se fermata manualmente)
      if (stopSyncRef.current) {
        addSyncEvent(
          `🛑 Sincronizzazione fermata manualmente! ${totalSynced} Business, ${totalSkipped} privati, ${batchNumber} batch processati`,
          'info'
        );
      } else {
        addSyncEvent(
          `🎉 Sincronizzazione completata! ${totalSynced} Business, ${totalSkipped} privati, ${batchNumber} batch`,
          'success'
        );
      }
      
      // Ricarica i dati dopo 2 secondi
      setTimeout(() => {
        loadKpiData();
      }, 2000);

    } catch (err) {
      console.error('Error syncing customers:', err);
      addSyncEvent(`❌ Errore: ${err instanceof Error ? err.message : 'Errore sconosciuto'}`, 'error');
      setSyncProgress(prev => ({ ...prev, isComplete: true }));
    } finally {
      setSyncing(false);
    }
  };

  const handleIssueInvoice = async (shopifyOrderId: string) => {
    setIssuingInvoice(shopifyOrderId);
    try {
      const response = await fetch('/api/invoices/issue', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminPassword}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ shopifyOrderId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Errore durante emissione fattura');
      }

      const data = await response.json();
      alert(`Fattura emessa: ${data.invoiceId}`);
      
      // Ricarica gli ordini
      loadRecentOrders();
      loadKpiData();
    } catch (err) {
      console.error('Error issuing invoice:', err);
      alert(err instanceof Error ? err.message : 'Errore durante emissione fattura');
    } finally {
      setIssuingInvoice(null);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    
    try {
      // Testa la password facendo una chiamata API
      const response = await fetch('/api/admin/orders/stats', {
        headers: {
          'Authorization': `Bearer ${passwordInput}`,
        },
      });

      if (response.ok) {
        // Salva la password in sessionStorage per condividerla tra le pagine
        sessionStorage.setItem('adminPassword', passwordInput);
        setAdminPassword(passwordInput);
        setIsAuthenticated(true);
        setPasswordInput('');
      } else {
        setLoginError('Password non valida');
      }
    } catch (err) {
      setLoginError('Errore di connessione');
    }
  };

  const getInvoiceStatusBadge = (status: string) => {
    switch (status) {
      case 'ISSUED':
        return <Badge variant="success">Emessa</Badge>;
      case 'PENDING':
        return <Badge variant="warning">In Attesa</Badge>;
      case 'ERROR':
        return <Badge variant="destructive">Errore</Badge>;
      case 'FOREIGN':
        return <Badge variant="info">Estero</Badge>;
      case 'CORRISPETTIVO':
        return <Badge className="bg-gray-600">Corrispettivo</Badge>;
      case 'CANCELLED':
        return <Badge className="bg-red-800">Annullato</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Mostra il form di login se non autenticato
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Admin Login</CardTitle>
            <CardDescription>Inserisci la password per accedere al pannello admin</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password Admin</Label>
                <Input
                  id="password"
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Inserisci password"
                  required
                />
              </div>
              {loginError && (
                <p className="text-sm text-red-600">{loginError}</p>
              )}
              <Button type="submit" className="w-full">
                Accedi
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Mostra loading solo dopo autenticazione
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Caricamento dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Dashboard Amministrazione
          </h1>
          <p className="mt-2 text-gray-600">
            Gestione fatturazione e clienti Shopify
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Clienti Totali
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpiData.totalUsers}</div>
              <p className="text-xs text-muted-foreground">
                {kpiData.businessUsers} aziendali
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Ordini Totali
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpiData.totalOrders}</div>
              <p className="text-xs text-muted-foreground">
                {kpiData.foreignOrders} esteri, {kpiData.corrispettiviOrders} corrispettivi
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Fatture Emesse
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpiData.issuedInvoices}</div>
              <p className="text-xs text-muted-foreground">
                {kpiData.pendingInvoices} in attesa
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Errori Fatturazione
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{kpiData.errorInvoices}</div>
              <p className="text-xs text-muted-foreground">
                Richiedono attenzione
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Azioni Rapide */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Azioni Rapide</CardTitle>
            <CardDescription>
              Operazioni comuni di gestione
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
                onClick={() => window.location.href = '/admin/customers'}
                variant="outline"
              >
                Gestione Clienti
              </Button>
              <Button 
                onClick={() => window.location.href = '/admin/credit-notes'}
                variant="outline"
              >
                Note di Credito
              </Button>
              <Button 
                onClick={() => window.location.href = '/admin/corrispettivi'}
                variant="outline"
                className="bg-gray-100 hover:bg-gray-200"
              >
                📋 Corrispettivi
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Ordini Recenti */}
        <Card>
          <CardHeader>
            <CardTitle>Ordini Recenti</CardTitle>
            <CardDescription>
              Ultimi 10 ordini con stato fatturazione
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ordine</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Totale</TableHead>
                  <TableHead>P.IVA</TableHead>
                  <TableHead>Stato Fattura</TableHead>
                  <TableHead>Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">
                      {order.orderNumber}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {order.user.firstName} {order.user.lastName}
                        </div>
                        <div className="text-sm text-gray-500">
                          {order.user.email}
                        </div>
                        {order.user.billingProfile?.companyName && (
                          <div className="text-sm text-gray-500">
                            {order.user.billingProfile.companyName}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Intl.NumberFormat('it-IT', {
                        style: 'currency',
                        currency: order.currency || 'EUR',
                      }).format(order.totalPrice)}
                    </TableCell>
                    <TableCell>
                      {order.hasVatProfile ? (
                        <Badge variant="success">Sì</Badge>
                      ) : (
                        <Badge variant="secondary">No</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {getInvoiceStatusBadge(order.invoiceStatus)}
                      {order.lastError && (
                        <div className="text-xs text-red-500 mt-1">
                          {order.lastError}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {order.invoiceStatus === 'PENDING' && order.hasVatProfile && (
                        <Button
                          size="sm"
                          onClick={() => handleIssueInvoice(order.shopifyOrderId)}
                          disabled={issuingInvoice === order.shopifyOrderId}
                        >
                          {issuingInvoice === order.shopifyOrderId ? 'Emissione...' : 'Emetti Fattura'}
                        </Button>
                      )}
                      {order.invoiceStatus === 'ISSUED' && order.invoiceId && (
                        <Button size="sm" variant="outline" disabled>
                          Fattura: {order.invoiceId}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            
            {orders.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                Nessun ordine trovato
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pulsante "Mostra Progresso" (visibile solo se dialog chiuso ma sync in corso) */}
      {syncing && !showSyncDialog && (
        <button
          onClick={() => setShowSyncDialog(true)}
          className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-pulse z-50"
        >
          <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Mostra Progresso Sincronizzazione
        </button>
      )}

      {/* Dialog Timeline Real-Time */}
      <SyncProgressDialog
        isOpen={showSyncDialog}
        onOpenChange={setShowSyncDialog}
        totalProcessed={syncProgress.totalProcessed}
        businessSynced={syncProgress.businessSynced}
        privateSkipped={syncProgress.privateSkipped}
        currentBatch={syncProgress.currentBatch}
        estimatedTotal={syncProgress.estimatedTotal}
        events={syncEvents}
        isComplete={syncProgress.isComplete}
        isSyncing={syncing}
        onStop={handleStopSync}
      />
    </div>
  );
}