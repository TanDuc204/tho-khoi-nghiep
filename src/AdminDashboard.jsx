import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { db, auth, appId } from './firebase';
import { ideaDatabase, quizQuestions } from './data';
import * as XLSX from 'xlsx';
import {
  BarChart3,
  Download,
  RefreshCw,
  Users,
  Search,
  ChevronUp,
  ChevronDown,
  ArrowLeft,
  Filter,
  Lock,
  LogIn,
  Mail,
  MessageCircle,
} from 'lucide-react';

const ADMIN_PASSWORD = 'tho.khoinghiep@';

const QUESTION_LABELS = {
  capital: 'Von',
  competence: 'Nang luc',
  time: 'Thoi gian',
};

const SOURCE_LABELS = {
  '3c_form_v2': 'Form 3C',
  unknown: 'Khong ro',
};

const CONTACT_METHOD_LABELS = {
  email: 'Email',
  zalo: 'Zalo/SDT',
};

const OPTION_LABEL_MAP = quizQuestions.reduce((acc, question) => {
  acc[question.id] = question.options.reduce((optionAcc, option) => {
    optionAcc[option.value] = option.label;
    return optionAcc;
  }, {});
  return acc;
}, {});

const IDEA_TITLE_MAP = new Map(ideaDatabase.map((idea) => [String(idea.id), idea.title]));

const COLOR_CLASS_BY_TYPE = {
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-green-50 text-green-700',
  amber: 'bg-amber-50 text-amber-700',
  slate: 'bg-slate-100 text-slate-700',
};

const toDate = (ts) => {
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return null;
};

const getFilterLabel = (key, value) => {
  if (!value) return '—';
  return OPTION_LABEL_MAP[key]?.[value] || value;
};

const getMatchedIdeaTitles = (matchedIdeaIds = []) => {
  if (!Array.isArray(matchedIdeaIds) || matchedIdeaIds.length === 0) return [];
  return matchedIdeaIds.map((id) => IDEA_TITLE_MAP.get(String(id)) || `Idea #${id}`);
};

const formatSubmittedTime = (lead) => {
  const date = toDate(lead.submittedAt) || toDate(lead.createdAt);
  if (!date) return '—';
  return `${date.toLocaleDateString('vi-VN')} ${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
};

const getSortValue = (lead, sortKey) => {
  switch (sortKey) {
    case 'submittedAt': {
      const date = toDate(lead.submittedAt) || toDate(lead.createdAt);
      return date ? date.getTime() : 0;
    }
    case 'name':
      return (lead.name || '').toLowerCase();
    case 'contactValue':
      return (lead.contactValue || '').toLowerCase();
    case 'location':
      return (lead.location || '').toLowerCase();
    case 'contactMethod':
      return (lead.contactMethod || '').toLowerCase();
    case 'source':
      return (lead.source || '').toLowerCase();
    default:
      return '';
  }
};

const normalizeLead = (lead) => {
  const contactInfo = lead.contactInfo || {};
  const filters = lead.filters || lead.answers || {};
  const matchedIdeaIds = Array.isArray(lead.matchedIdeaIds) ? lead.matchedIdeaIds : [];

  const contactValue = lead.contactValue || contactInfo.contact || '';
  const contactMethod = lead.contactMethod || (/\S+@\S+\.\S+/.test(contactValue) ? 'email' : 'zalo');

  return {
    ...lead,
    name: lead.name || contactInfo.name || '',
    contactValue,
    contactMethod,
    location: lead.location || contactInfo.city || '',
    filters,
    matchedIdeaIds,
    matchedIdeaTitles: getMatchedIdeaTitles(matchedIdeaIds),
    source: lead.source || 'unknown',
  };
};

const AdminDashboard = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [user, setUser] = useState(null);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState('submittedAt');
  const [sortDir, setSortDir] = useState('desc');

  const [filterContactMethod, setFilterContactMethod] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterCapital, setFilterCapital] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setLoginError('');
      return;
    }
    setLoginError('Sai mat khau. Vui long thu lai.');
    setPassword('');
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (authError) {
        console.error(authError);
      }
    };

    initAuth();
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  const fetchLeads = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const leadsRef = collection(db, 'artifacts', appId, 'public', 'data', 'leads');
      const snap = await getDocs(leadsRef);
      const fetchedLeads = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setLeads(fetchedLeads);
    } catch (fetchError) {
      console.error(fetchError);
      setError('Khong the tai du lieu. Kiem tra ket noi hoac quyen Firestore.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchLeads();
  }, [user, fetchLeads]);

  const normalizedLeads = useMemo(() => leads.map(normalizeLead), [leads]);

  const filtered = useMemo(() => {
    let result = [...normalizedLeads];

    if (searchTerm.trim()) {
      const keyword = searchTerm.trim().toLowerCase();
      result = result.filter((lead) => {
        const searchableText = [
          lead.name,
          lead.contactValue,
          lead.location,
          lead.source,
          ...lead.matchedIdeaTitles,
        ]
          .join(' ')
          .toLowerCase();
        return searchableText.includes(keyword);
      });
    }

    if (filterContactMethod) {
      result = result.filter((lead) => lead.contactMethod === filterContactMethod);
    }
    if (filterSource) {
      result = result.filter((lead) => lead.source === filterSource);
    }
    if (filterCapital) {
      result = result.filter((lead) => lead.filters?.capital === filterCapital);
    }

    result.sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);

      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [normalizedLeads, searchTerm, filterContactMethod, filterSource, filterCapital, sortKey, sortDir]);

  const stats = useMemo(() => {
    const total = normalizedLeads.length;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayCount = normalizedLeads.filter((lead) => {
      const date = toDate(lead.submittedAt) || toDate(lead.createdAt);
      return date && date >= today;
    }).length;

    const emailCount = normalizedLeads.filter((lead) => lead.contactMethod === 'email').length;
    const zaloCount = normalizedLeads.filter((lead) => lead.contactMethod !== 'email').length;

    return { total, todayCount, emailCount, zaloCount };
  }, [normalizedLeads]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  };

  const exportToExcel = () => {
    const rows = filtered.map((lead, index) => ({
      '#': index + 1,
      'Ho ten': lead.name || '',
      'Lien he': lead.contactValue || '',
      'Kenh': CONTACT_METHOD_LABELS[lead.contactMethod] || lead.contactMethod || '',
      'Thanh pho': lead.location || '',
      'Von': getFilterLabel('capital', lead.filters?.capital),
      'Nang luc': getFilterLabel('competence', lead.filters?.competence),
      'Thoi gian': getFilterLabel('time', lead.filters?.time),
      'Y tuong goi y': lead.matchedIdeaTitles.join(' | '),
      'Nguon': SOURCE_LABELS[lead.source] || lead.source || '',
      'Ngay gui': formatSubmittedTime(lead),
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const colWidths = Object.keys(rows[0] || {}).map((key) => ({
      wch: Math.max(key.length, ...rows.map((row) => String(row[key] || '').length)) + 2,
    }));
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads_3C');
    XLSX.writeFile(workbook, `leads_3c_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <ChevronUp className="h-3 w-3 opacity-20" />;
    return sortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 text-green-600" />
      : <ChevronDown className="h-3 w-3 text-green-600" />;
  };

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
              <p className="text-sm text-gray-400 mt-1">Nhap mat khau de truy cap</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <input
                type="password"
                placeholder="Mat khau"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-200 transition-all text-sm"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setLoginError('');
                }}
                autoFocus
              />

              {loginError && (
                <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg text-center border border-red-100">
                  {loginError}
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-green-600/30 transition-all flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" /> Dang nhap
              </button>
            </form>

            <a href="/" className="block text-center text-xs text-gray-400 hover:text-green-600 mt-5 transition-colors">
              ← Quay lai trang chu
            </a>
          </div>
        </div>
      </div>
    );
  }

  const activeFilterCount = [filterContactMethod, filterSource, filterCapital].filter(Boolean).length;

  const statCards = [
    { label: 'Tong leads', value: stats.total, icon: Users, color: 'blue' },
    { label: 'Hom nay', value: stats.todayCount, icon: BarChart3, color: 'green' },
    { label: 'Email', value: stats.emailCount, icon: Mail, color: 'amber' },
    { label: 'Zalo/SDT', value: stats.zaloCount, icon: MessageCircle, color: 'slate' },
  ];

  return (
    <div className="min-h-screen bg-gray-50/80">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
              <ArrowLeft className="w-5 h-5" />
            </a>
            <div>
              <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-green-600" /> Dashboard Leads 3C
              </h1>
              <p className="text-xs text-gray-400">Tho Khoi Nghiep - Du lieu tu form hien tai</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchLeads}
              disabled={loading}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Lam moi
            </button>
            <button
              onClick={exportToExcel}
              disabled={!filtered.length}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white shadow-sm shadow-green-600/20 transition-all disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> Tai Excel
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {error && (
          <div className="bg-red-50 text-red-600 text-sm p-4 rounded-xl border border-red-100">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card) => (
            <div key={card.label} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{card.label}</span>
                <div className={`p-2 rounded-lg ${COLOR_CLASS_BY_TYPE[card.color]}`}>
                  <card.icon className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-extrabold text-gray-900">{card.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Tim ten, lien he, thanh pho, y tuong..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 bg-gray-50"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
            <button
              onClick={() => setShowFilters((value) => !value)}
              className={`inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2.5 rounded-xl border transition-all ${showFilters ? 'bg-green-50 border-green-500 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              <Filter className="w-4 h-4" /> Bo loc
              {activeFilterCount > 0 && (
                <span className="ml-1 w-5 h-5 flex items-center justify-center rounded-full bg-green-600 text-white text-[10px] font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-100">
              <select
                value={filterContactMethod}
                onChange={(event) => setFilterContactMethod(event.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:border-green-500"
              >
                <option value="">Tat ca kenh lien he</option>
                <option value="email">Email</option>
                <option value="zalo">Zalo/SDT</option>
              </select>

              <select
                value={filterSource}
                onChange={(event) => setFilterSource(event.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:border-green-500"
              >
                <option value="">Tat ca nguon</option>
                <option value="3c_form_v2">Form 3C</option>
              </select>

              <select
                value={filterCapital}
                onChange={(event) => setFilterCapital(event.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:border-green-500"
              >
                <option value="">Tat ca muc von</option>
                {(quizQuestions.find((q) => q.id === 'capital')?.options || []).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>

              {activeFilterCount > 0 && (
                <button
                  onClick={() => {
                    setFilterContactMethod('');
                    setFilterSource('');
                    setFilterCapital('');
                  }}
                  className="text-sm text-red-500 hover:text-red-700 font-medium px-3 py-2"
                >
                  Xoa bo loc
                </button>
              )}
            </div>
          )}

          <p className="text-xs text-gray-400 mt-3">
            Hien thi <strong className="text-gray-600">{filtered.length}</strong> / {normalizedLeads.length} ket qua
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100">
                  {[
                    { key: null, label: '#', sortable: false, width: 'w-12' },
                    { key: 'name', label: 'Ho ten', sortable: true },
                    { key: 'contactValue', label: 'Lien he', sortable: true },
                    { key: 'contactMethod', label: 'Kenh', sortable: true },
                    { key: 'location', label: 'Thanh pho', sortable: true },
                    { key: null, label: '3C', sortable: false },
                    { key: null, label: 'Y tuong goi y', sortable: false },
                    { key: 'source', label: 'Nguon', sortable: true },
                    { key: 'submittedAt', label: 'Ngay gui', sortable: true },
                  ].map((column) => (
                    <th
                      key={column.label}
                      className={`px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap ${column.width || ''} ${column.sortable ? 'cursor-pointer select-none hover:text-gray-900 transition-colors' : ''}`}
                      onClick={() => column.sortable && handleSort(column.key)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {column.label}
                        {column.sortable && <SortIcon col={column.key} />}
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
                        <span className="text-sm">Dang tai du lieu...</span>
                      </div>
                    </td>
                  </tr>
                ) : !filtered.length ? (
                  <tr>
                    <td colSpan={9} className="text-center py-20 text-gray-400 text-sm">
                      Khong co du lieu
                    </td>
                  </tr>
                ) : (
                  filtered.map((lead, index) => (
                    <tr key={lead.id} className="hover:bg-green-50/30 transition-colors align-top">
                      <td className="px-4 py-3 text-gray-400 text-xs font-mono">{index + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-[180px] whitespace-normal">{lead.name || '—'}</td>
                      <td className="px-4 py-3 text-gray-700 max-w-[220px] break-all">{lead.contactValue || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${lead.contactMethod === 'email' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>
                          {CONTACT_METHOD_LABELS[lead.contactMethod] || lead.contactMethod || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-[160px] whitespace-normal">{lead.location || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-700 min-w-[200px]">
                        <div><strong>{QUESTION_LABELS.capital}:</strong> {getFilterLabel('capital', lead.filters?.capital)}</div>
                        <div><strong>{QUESTION_LABELS.competence}:</strong> {getFilterLabel('competence', lead.filters?.competence)}</div>
                        <div><strong>{QUESTION_LABELS.time}:</strong> {getFilterLabel('time', lead.filters?.time)}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700 min-w-[220px] whitespace-normal">
                        {lead.matchedIdeaTitles.length > 0 ? lead.matchedIdeaTitles.join(' | ') : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">{SOURCE_LABELS[lead.source] || lead.source || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{formatSubmittedTime(lead)}</td>
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