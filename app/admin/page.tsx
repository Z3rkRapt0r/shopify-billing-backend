'use client';

import { useState, useEffect } from 'react';
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
}

interface Order {
  id: string;
  shopifyOrderId: string;
  orderNumber: string;
  currency: string;
  totalPrice: number;
  createdAt: string;
  hasVatProfile: boolean;
  invoiceStatus: 'PENDING' | 'ISSUED' | 'ERROR' | 'FOREIGN';
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
      let lastCustomerId: string | undefined = undefined;
      let batchNumber = 0;

      addSyncEvent('🔍 Recupero conteggio totale clienti da Shopify...', 'info');
      
      // Continua finché ci sono altri clienti (NESSUN LIMITE!)
      while (hasMore) {
        batchNumber++;
        addSyncEvent(`📦 Elaborazione batch #${batchNumber}...`, 'info');

        const response: Response = await fetch('/api/admin/sync-customers', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${adminPassword}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            limit: 50,
            since_id: lastCustomerId,
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
          lastCustomerId: data.lastCustomerId,
        });
        
        // Accumula statistiche
        totalSynced += data.syncedCount || 0;
        totalProcessed += data.processedCount || 0;
        totalSkipped += data.skippedCount || 0;
        
        hasMore = data.hasMore;
        lastCustomerId = data.lastCustomerId;
        
        console.log(`   ➡️  hasMore=${hasMore}, continua=${hasMore ? 'SÌ' : 'NO'}`);

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

        // Pausa tra i batch per rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
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
                {kpiData.foreignOrders} esteri
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