import React, { useState } from 'react';
import { PPDIProvider, usePPDI } from './context/PPDIContext';
import { PublicRegistrationForm } from './components/PublicRegistrationForm';
import { LoginForm } from './components/LoginForm';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { AnggotaListView } from './components/AnggotaListView';
import { EKTAView } from './components/EKTAView';
import { RetirementAlertView } from './components/RetirementAlertView';
import { ArsipSKView } from './components/ArsipSKView';
import { IuranView } from './components/IuranView';
import { SqlSchemaView } from './components/SqlSchemaView';
import { UserSettingsView } from './components/UserSettingsView';
import { RoleManagementView } from './components/RoleManagementView';
import { AppSettingsView } from './components/AppSettingsView';
import { PendaftaranApprovalView } from './components/PendaftaranApprovalView';
import { AnggotaFormModal } from './components/AnggotaFormModal';
import { AnggotaDetailModal } from './components/AnggotaDetailModal';
import { DbConnectionModal } from './components/DbConnectionModal';
import { DbSettingsView } from './components/DbSettingsView';
import { AnggotaFullDetail } from './types/ppdi';

const MainAppContent: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    isAuthenticated,
    isDbModalOpen,
    setIsDbModalOpen,
    dbStatus,
    isCheckingDb,
    checkDbStatus,
    currentUser,
  } = usePPDI();

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isRegistrationModalOpen, setIsRegistrationModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<AnggotaFullDetail | null>(null);
  const [detailMember, setDetailMember] = useState<AnggotaFullDetail | null>(null);
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [verifyInitialQuery, setVerifyInitialQuery] = useState('');
  const [selectedKtaMemberId, setSelectedKtaMemberId] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState(false);


  const handleOpenAddModal = () => {
    setEditingMember(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (member: AnggotaFullDetail) => {
    setEditingMember(member);
    setIsAddModalOpen(true);
  };

  const handleOpenDetailModal = (member: AnggotaFullDetail) => {
    setDetailMember(member);
  };

  const handleSelectForKTA = (member: AnggotaFullDetail) => {
    setSelectedKtaMemberId(member.anggota.id_anggota);
    setActiveTab('ekta');
  };

  const handleOpenVerifyModalWithQuery = (query?: string) => {
    if (query) setVerifyInitialQuery(query);
    setIsVerifyModalOpen(true);
  };

  
  if (!isAuthenticated) {
    return (
      <>
        <LoginForm onOpenPublicVerify={() => setIsRegistrationModalOpen(true)} />
        <PublicRegistrationForm
          isOpen={isRegistrationModalOpen}
          onClose={() => setIsRegistrationModalOpen(false)}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F7F4] text-[#111113] flex flex-col font-sans relative selection:bg-[#FDE047] selection:text-[#064E3B]">
      {/* Background dot pattern */}
      <div className="bg-pattern fixed inset-0 pointer-events-none z-0 opacity-60" />

      {/* Top Header */}
      <Header
        onOpenAddModal={handleOpenAddModal}
        onOpenVerifyModal={() => handleOpenVerifyModalWithQuery()}
        onOpenDbModal={() => setIsDbModalOpen(true)}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      {/* Main Body Layout: Sidebar + Main Stage */}
      <div className="relative z-10 flex-1 max-w-7xl w-full mx-auto flex flex-col md:flex-row">
        {/* Navigation Sidebar */}
        <div className="no-print relative">
          <Sidebar
            onOpenVerifyModal={() => handleOpenVerifyModalWithQuery()}
            isOpen={sidebarOpen}
            setIsOpen={setSidebarOpen}
          />
        </div>

        {/* Content Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0">
          {activeTab === 'dashboard' && <DashboardView />}
          {activeTab === 'pendaftaran' && (
            <PendaftaranApprovalView onOpenPublicForm={() => setIsRegistrationModalOpen(true)} />
          )}
          {activeTab === 'anggota' && (
            <AnggotaListView
              onOpenAddModal={handleOpenAddModal}
              onOpenDetailModal={handleOpenDetailModal}
              onOpenEditModal={handleOpenEditModal}
              onSelectForKTA={handleSelectForKTA}
            />
          )}
          {activeTab === 'ekta' && (
            <EKTAView
              selectedMemberId={selectedKtaMemberId}
              onOpenVerifyModal={handleOpenVerifyModalWithQuery}
            />
          )}
          {activeTab === 'pensiun' && (
            <RetirementAlertView onOpenDetailModal={handleOpenDetailModal} />
          )}
          {activeTab === 'arsip' && <ArsipSKView />}
          {activeTab === 'iuran' && <IuranView />}
          {(activeTab === 'settings' || activeTab === 'settings-app') && <AppSettingsView />}
          {activeTab === 'settings-user' && <UserSettingsView />}
          {activeTab === 'settings-role' && <RoleManagementView />}
          {activeTab === 'settings-db' && <DbSettingsView />}
          {activeTab === 'skema' && <SqlSchemaView />}
        </main>
      </div>

      {/* Public Registration Form Modal (Accessible while logged in as well) */}
      <PublicRegistrationForm
        isOpen={isRegistrationModalOpen}
        onClose={() => setIsRegistrationModalOpen(false)}
      />

      {/* Add / Edit Member Modal */}
      <AnggotaFormModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingMember(null);
        }}
        editMember={editingMember}
      />

      {/* Detail Profile Drawer / Modal */}
      <AnggotaDetailModal
        member={detailMember}
        isOpen={Boolean(detailMember)}
        onClose={() => setDetailMember(null)}
        onSelectForKTA={handleSelectForKTA}
      />

      {/* Database Connection & MySQL Status Modal */}
      {currentUser.role === 'Superadmin_Kabupaten' && (
        <DbConnectionModal
          isOpen={isDbModalOpen}
          onClose={() => setIsDbModalOpen(false)}
        />
      )}

      {/* Floating Database Connection Status & Quick Diagnostic Trigger */}
      <aside aria-label="Status Koneksi Database" className="fixed bottom-4 right-4 z-40 no-print flex items-center gap-2">
        <button
          onClick={() => setIsDbModalOpen(true)}
          title={
            dbStatus?.success
              ? `Koneksi MySQL Aktif (${dbStatus.latencyMs} ms · ${dbStatus.host}) - Klik untuk info diagnostik`
              : 'Koneksi MySQL Terputus - Klik untuk membuka solusi hosting'
          }
          className={`flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-md shadow-lg border text-xs font-mono transition-all cursor-pointer ${
            isCheckingDb
              ? 'bg-amber-950/90 text-amber-200 border-amber-500/50'
              : dbStatus?.success
              ? 'bg-white/95 text-neutral-800 border-emerald-500/40 hover:bg-emerald-50 hover:border-emerald-600 shadow-sm'
              : 'bg-red-950/90 text-red-200 border-red-500/80 hover:bg-red-900 shadow-md animate-pulse'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isCheckingDb
                ? 'bg-amber-400 animate-ping'
                : dbStatus?.success
                ? 'bg-emerald-500'
                : 'bg-red-500'
            }`}
          />
          <span className="font-semibold">
            {isCheckingDb
              ? 'Cek DB...'
              : dbStatus?.success
              ? `MySQL: ${dbStatus.latencyMs || 0}ms`
              : 'MySQL Offline (Solusi)'}
          </span>
        </button>
      </aside>
    </div>
  );
};

export default function App() {
  return (
    <PPDIProvider>
      <MainAppContent />
    </PPDIProvider>
  );
}
