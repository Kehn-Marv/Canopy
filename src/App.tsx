
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { VaultProvider, useVault } from './contexts/VaultContext';
import { AppShell } from './components/AppShell';
import { CanopyMark } from './components/Brand';
import { Library } from './pages/Library';
import { AssetDetail } from './pages/AssetDetail';
import { Shares } from './pages/Shares';
import { Signals } from './pages/Signals';
import { People } from './pages/People';
import { Settings } from './pages/Settings';
import { Access } from './pages/Access';
import { OpenContainer } from './pages/OpenContainer';
import { Gate } from './pages/Gate';
import { Toaster } from './components/ui/Sonner';
import { TooltipProvider } from './components/ui/Tooltip';

function Splash() {
  return (
    <div className="flex min-h-full w-full flex-col items-center justify-center gap-4 bg-background">
      <CanopyMark className="h-10 w-10 animate-pulse text-primary" />
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        opening the vault
      </p>
    </div>);

}

function VaultRoutes() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Library />} />
        <Route path="/item/:id" element={<AssetDetail />} />
        <Route path="/shares" element={<Shares />} />
        <Route path="/signals" element={<Signals />} />
        <Route path="/people" element={<People />} />
        <Route path="/open" element={<OpenContainer />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>);

}

function Surface() {
  const { phase } = useVault();
  if (phase === 'booting') return <Splash />;
  return (
    <Routes>
      {/* A recipient may hold no vault at all, so this route never sits behind the gate. */}
      <Route path="/a/:token" element={<Access />} />
      <Route path="*" element={phase === 'unlocked' ? <VaultRoutes /> : <Gate />} />
    </Routes>);

}

export function App() {
  return (
    <VaultProvider>
      <TooltipProvider delayDuration={200}>
        <HashRouter>
          <div className="min-h-full w-full">
            <Surface />
          </div>
        </HashRouter>
        <Toaster theme="dark" position="bottom-center" richColors closeButton />
      </TooltipProvider>
    </VaultProvider>);

}
