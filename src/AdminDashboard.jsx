import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { db, auth, appId } from './firebase';
import * as XLSX from 'xlsx';
import {
  BarChart3, Download, RefreshCw, Users, MousePointerClick,
  Search, ChevronUp, ChevronDown, ArrowLeft, Filter, Eye, EyeOff,
  Lock, LogIn
} from 'lucide-react';

// --- HARDCODED PASSWORD ---
const ADMIN_PASSWORD = 'tho.khoinghiep@';

// --- LABEL MAPS ---
const STAGE_LABELS = {
  tham_khao: 'Tham khảo',
  muon_lam: 'Muốn làm thử',
  da_ban: 'Đã bán nhỏ lẻ',
  nghiem_tuc: 'Làm nghiêm túc',
};

const TOPIC_LABELS = {
  chon_y_tuong: 'Chọn ý tưởng',
  ban_thu_7_ngay: 'Bán thử 7 ngày',
  marketing: 'Marketing / Content',
  nguon_hang: 'Nguồn hàng / SP',
  von_chi_phi: 'Tính vốn / Chi phí',
  khac: 'Khác',
};

const AdminDashboard = () => {
  // --- AUTH GATE ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setLoginError('');
    } else {
      setLoginError('Sai mật khẩu. Vui lòng thử lại.');
      setPassword('');
    }
  };

  // --- DASHBOARD STATE ---
  const [user, setUser] = useState(null);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState('submittedAt');
  const [sortDir, setSortDir] = useState('desc');
  const [filterStage, setFilterStage] = useState('');
  const [filterTopic, setFilterTopic] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Auth
  useEffect(() => {
    const initAuth = async () => {
      try { await signInAnonymously(auth); } catch (e) { console.error(e); }
    };
    initAuth();
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  // Fetch leads
  const fetchLeads = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const leadsRef = collection(db, 'artifacts', appId, 'public', 'data', 'leads');
      const q = query(leadsRef, orderBy('submittedAt', 'desc'));
      const snap = await getDocs(q);
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setLeads(data);
    } catch (e) {
      console.error(e);
      setError('Không thể tải dữ liệu. Kiểm tra kết nối hoặc quyền Firestore.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { if (user) fetchLeads(); }, [user, fetchLeads]);

  // --- DERIVED DATA ---
  const filtered = useMemo(() => {
    let result = [...leads];
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      result = result.filter(
        (l) =>
          (l.contactValue || '').toLowerCase().includes(s) ||
          (l.location || '').toLowerCase().includes(s) ||
          (l.otherLocation || '').toLowerCase().includes(s) ||
          (l.otherTopic || '').toLowerCase().includes(s)
      );
    }
    if (filterStage) result = result.filter((l) => l.stage === filterStage);
    if (filterTopic) result = result.filter((l) => l.topic === filterTopic);

    result.sort((a, b) => {
      let va = a[sortKey];
      let vb = b[sortKey];
      // Handle Firestore Timestamp objects
      if (va?.toDate) va = va.toDate();
      if (vb?.toDate) vb = vb.toDate();
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [leads, searchTerm, sortKey, sortDir, filterStage, filterTopic]);

  // Stats
  const stats = useMemo(() => {
    const total = leads.length;
    const clicked = leads.filter((l) => l.clickedMagnet).length;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = leads.filter((l) => {
      const d = l.submittedAt?.toDate?.();
      return d && d >= today;
    }).length;
    return { total, clicked, todayCount, clickRate: total ? ((clicked / total) * 100).toFixed(1) : 0 };
  }, [leads]);

  // Sort handler
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <ChevronUp className="w-3 h-3 opacity-20" />;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-green-600" /> : <ChevronDown className="w-3 h-3 text-green-600" />;
  };

  // --- EXPORT ---
  const exportToExcel = () => {
    const rows = filtered.map((l, i) => ({
      '#': i + 1,
      'Kênh': l.contactMethod === 'email' ? 'Email' : 'Zalo',
      'Liên hệ': l.contactValue || '',
      'Nơi ở': l.location === 'Khác' ? (l.otherLocation || 'Khác') : (l.location || ''),
      'Độ tuổi': l.age || '',
      'Giai đoạn': STAGE_LABELS[l.stage] || l.stage || '',
      'Chủ đề': l.topic === 'khac' ? (l.otherTopic || 'Khác') : (TOPIC_LABELS[l.topic] || l.topic || ''),
      'Đã mở Sheet': l.clickedMagnet ? 'Có' : 'Không',
      'Ngày đăng ký': l.submittedAt?.toDate?.() ? l.submittedAt.toDate().toLocaleString('vi-VN') : '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    // Auto-width columns
    const colWidths = Object.keys(rows[0] || {}).map((key) => ({
      wch: Math.max(key.length, ...rows.map((r) => String(r[key] || '').length)) + 2,
    }));
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    XLSX.writeFile(wb, `leads_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Format timestamp
  const fmtDate = (ts) => {
    if (!ts?.toDate) return '—';
    const d = ts.toDate();
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  // --- RENDER ---

  // Login gate
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50/80 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-400 to-green-600"></div>

            <div className="flex flex-col items-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mb-4">
                <Lock className="w-8 h-8 text-green-600" />
              </div>
              <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-sm text-gray-400 mt-1">Nhập mật khẩu để truy cập</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <input
                  type="password"
                  placeholder="Mật khẩu"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-200 transition-all text-sm"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setLoginError(''); }}
                  autoFocus
                />
              </div>

              {loginError && (
                <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg text-center border border-red-100">
                  {loginError}
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-green-600/30 transition-all flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" /> Đăng nhập
              </button>
            </form>

            <a href="/" className="block text-center text-xs text-gray-400 hover:text-green-600 mt-5 transition-colors">
              ← Quay lại trang chủ
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard
  return (
    <div className="min-h-screen bg-gray-50/80">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
              <ArrowLeft className="w-5 h-5" />
            </a>
            <div>
              <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-green-600" /> Admin Dashboard
              </h1>
              <p className="text-xs text-gray-400">Thợ Khởi Nghiệp — Quản lý lead</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchLeads}
              disabled={loading}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
            </button>
            <button
              onClick={exportToExcel}
              disabled={!filtered.length}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white shadow-sm shadow-green-600/20 transition-all disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> Tải Excel
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Error */}
        {error && (
          <div className="bg-red-50 text-red-600 text-sm p-4 rounded-xl border border-red-100">{error}</div>
        )}

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Tổng leads', value: stats.total, icon: Users, color: 'blue' },
            { label: 'Hôm nay', value: stats.todayCount, icon: BarChart3, color: 'green' },
            { label: 'Đã mở Sheet', value: stats.clicked, icon: MousePointerClick, color: 'purple' },
            { label: 'Tỷ lệ click', value: `${stats.clickRate}%`, icon: Eye, color: 'amber' },
          ].map((s) => (
            <div
              key={s.label}
              className={`bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{s.label}</span>
                <div className={`p-2 rounded-lg bg-${s.color}-50 text-${s.color}-600`}>
                  <s.icon className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-extrabold text-gray-900">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Search & filter bar */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Tìm email, SĐT, địa điểm..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 bg-gray-50"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2.5 rounded-xl border transition-all ${showFilters ? 'bg-green-50 border-green-500 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              <Filter className="w-4 h-4" /> Bộ lọc
              {(filterStage || filterTopic) && (
                <span className="ml-1 w-5 h-5 flex items-center justify-center rounded-full bg-green-600 text-white text-[10px] font-bold">
                  {(filterStage ? 1 : 0) + (filterTopic ? 1 : 0)}
                </span>
              )}
            </button>
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-100 animate-fadeIn">
              <select
                value={filterStage}
                onChange={(e) => setFilterStage(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:border-green-500"
              >
                <option value="">Tất cả giai đoạn</option>
                {Object.entries(STAGE_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
              </select>
              <select
                value={filterTopic}
                onChange={(e) => setFilterTopic(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:border-green-500"
              >
                <option value="">Tất cả chủ đề</option>
                {Object.entries(TOPIC_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
              </select>
              {(filterStage || filterTopic) && (
                <button
                  onClick={() => { setFilterStage(''); setFilterTopic(''); }}
                  className="text-sm text-red-500 hover:text-red-700 font-medium px-3 py-2"
                >
                  Xoá bộ lọc
                </button>
              )}
            </div>
          )}

          <p className="text-xs text-gray-400 mt-3">
            Hiển thị <strong className="text-gray-600">{filtered.length}</strong> / {leads.length} kết quả
          </p>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100">
                  {[
                    { key: null, label: '#', sortable: false, width: 'w-12' },
                    { key: 'contactMethod', label: 'Kênh', sortable: true },
                    { key: 'contactValue', label: 'Liên hệ', sortable: true },
                    { key: 'location', label: 'Nơi ở', sortable: true },
                    { key: 'age', label: 'Tuổi', sortable: true },
                    { key: 'stage', label: 'Giai đoạn', sortable: true },
                    { key: 'topic', label: 'Chủ đề', sortable: true },
                    { key: 'clickedMagnet', label: 'Mở Sheet', sortable: true },
                    { key: 'submittedAt', label: 'Ngày ĐK', sortable: true },
                  ].map((col) => (
                    <th
                      key={col.label}
                      className={`px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap ${col.width || ''} ${col.sortable ? 'cursor-pointer select-none hover:text-gray-900 transition-colors' : ''}`}
                      onClick={() => col.sortable && handleSort(col.key)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {col.sortable && <SortIcon col={col.key} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="text-center py-20">
                      <div className="inline-flex flex-col items-center gap-3 text-gray-400">
                        <RefreshCw className="w-6 h-6 animate-spin" />
                        <span className="text-sm">Đang tải dữ liệu...</span>
                      </div>
                    </td>
                  </tr>
                ) : !filtered.length ? (
                  <tr>
                    <td colSpan={9} className="text-center py-20 text-gray-400 text-sm">
                      Không có dữ liệu
                    </td>
                  </tr>
                ) : (
                  filtered.map((lead, i) => (
                    <tr key={lead.id} className="hover:bg-green-50/30 transition-colors">
                      <td className="px-4 py-3 text-gray-400 text-xs font-mono">{i + 1}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${lead.contactMethod === 'email' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>
                          {lead.contactMethod === 'email' ? 'Email' : 'Zalo'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate">{lead.contactValue || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {lead.location === 'Khác' ? (lead.otherLocation || 'Khác') : (lead.location || '—')}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{lead.age || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded-md font-medium">
                          {STAGE_LABELS[lead.stage] || lead.stage || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[150px] truncate">
                        {lead.topic === 'khac' ? (lead.otherTopic || 'Khác') : (TOPIC_LABELS[lead.topic] || lead.topic || '—')}
                      </td>
                      <td className="px-4 py-3">
                        {lead.clickedMagnet ? (
                          <span className="inline-flex items-center gap-1 text-green-600 text-xs font-semibold">
                            <Eye className="w-3.5 h-3.5" /> Đã mở
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-gray-400 text-xs">
                            <EyeOff className="w-3.5 h-3.5" /> Chưa
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(lead.submittedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
