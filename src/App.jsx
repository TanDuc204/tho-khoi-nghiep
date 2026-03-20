import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Wallet,
  Banknote,
  Landmark,
  Coffee,
  Camera,
  PenTool,
  Briefcase,
  Calendar,
  Clock,
  Sprout,
  Cake,
  Package,
  X,
  ArrowRight,
  FileBarChart2,
  Star,
  RotateCcw,
  Lightbulb,
  Users,
  TrendingUp,
  Target,
  Search,
  Rocket,
  BookOpen,
  Info,
  Send,
  ChevronRight,
  Megaphone,
  Paintbrush,
  Headphones,
  CreditCard,
  Brain,
  Timer,
  Share2,
} from 'lucide-react';

import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { db, auth, appId } from './firebase';
import { ideaDatabase, quizQuestions } from './data';

/* ----- Icon resolver ----- */
const getIcon = (iconName, className) => {
  const icons = {
    coffee: Coffee,
    camera: Camera,
    sprout: Sprout,
    cake: Cake,
    package: Package,
    wallet: Wallet,
    banknote: Banknote,
    landmark: Landmark,
    pentool: PenTool,
    briefcase: Briefcase,
    calendar: Calendar,
    clock: Clock,
  };
  const IconCmp = icons[iconName] || Package;
  return <IconCmp className={className} />;
};

/* ----- Filter card config (matches code.html 3C colored cards) ----- */
const filterCardConfig = {
  capital: {
    bgCard: 'bg-emerald-50',
    bgSelected: 'bg-emerald-600',
    hoverBg: 'hover:bg-emerald-100',
    iconColor: 'text-emerald-600',
    icon: <CreditCard className="w-7 h-7" />,
    label: '1. Vốn',
  },
  competence: {
    bgCard: 'bg-green-50',
    bgSelected: 'bg-green-600',
    hoverBg: 'hover:bg-green-100',
    iconColor: 'text-green-600',
    icon: <Brain className="w-7 h-7" />,
    label: '2. Năng lực',
  },
  time: {
    bgCard: 'bg-teal-50',
    bgSelected: 'bg-teal-600',
    hoverBg: 'hover:bg-teal-100',
    iconColor: 'text-teal-600',
    icon: <Timer className="w-7 h-7" />,
    label: '3. Thời gian',
  },
};

/* --------------------------------------------------------------- */
export default function App() {
  const initialFilters = { capital: null, competence: null, time: null };
  const initialLeadForm = { name: '', contact: '', city: '' };
  const getInitialSelectedIdea = () => {
    const ideaFromUrl = new URLSearchParams(window.location.search).get('idea');
    if (!ideaFromUrl) return null;
    return ideaDatabase.find((item) => String(item.id) === ideaFromUrl) || null;
  };

  const [user, setUser] = useState(null);
  const [filters, setFilters] = useState(initialFilters);
  const [quizStep, setQuizStep] = useState('select');
  const [leadForm, setLeadForm] = useState(initialLeadForm);
  const [leadErrors, setLeadErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [topIdeas, setTopIdeas] = useState([]);
  const [selectedIdea, setSelectedIdea] = useState(getInitialSelectedIdea);
  const [copiedIdeaId, setCopiedIdeaId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const shareToastTimeoutRef = useRef(null);

  /* -- Firebase auth -- */
  useEffect(() => {
    const initAuth = async () => {
      try { await signInAnonymously(auth); } catch (e) { console.error('Firebase Auth Error:', e); }
    };
    initAuth();
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    document.body.style.overflow = selectedIdea ? 'hidden' : 'unset';
    const url = new URL(window.location.href);
    if (selectedIdea) {
      url.searchParams.set('idea', String(selectedIdea.id));
    } else {
      url.searchParams.delete('idea');
    }
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, [selectedIdea]);

  useEffect(() => () => {
    if (shareToastTimeoutRef.current) {
      clearTimeout(shareToastTimeoutRef.current);
    }
  }, []);

  const scoreIdeasByAnswers = (answers) => {
    const scored = ideaDatabase.map((idea) => {
      let score = 0;
      if (answers.capital && idea.tags.capital.includes(answers.capital)) score += 2;
      if (answers.competence && idea.tags.competence.includes(answers.competence)) score += 3;
      if (answers.time && idea.tags.time.includes(answers.time)) score += 1;
      return { ...idea, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored;
  };

  /* -- Handlers -- */
  const handleFilterChange = (questionId, value) => {
    setFilters((prev) => {
      return { ...prev, [questionId]: prev[questionId] === value ? null : value };
    });
    setLeadErrors({});
    setTopIdeas([]);
  };

  const filteredIdeas = useMemo(() => {
    let ideas = [...ideaDatabase];
    if (searchTerm.trim()) {
      const t = searchTerm.toLowerCase();
      ideas = ideas.filter(
        (i) => i.title.toLowerCase().includes(t) || i.shortDesc.toLowerCase().includes(t) || i.industry.toLowerCase().includes(t),
      );
    }
    return ideas;
  }, [searchTerm]);

  const ideasPerPage = 9;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredIdeas.length / ideasPerPage)), [filteredIdeas.length]);
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedIdeas = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * ideasPerPage;
    return filteredIdeas.slice(startIndex, startIndex + ideasPerPage);
  }, [filteredIdeas, safeCurrentPage]);
  const firstIdeaIndex = filteredIdeas.length === 0 ? 0 : (safeCurrentPage - 1) * ideasPerPage + 1;
  const lastIdeaIndex = Math.min(safeCurrentPage * ideasPerPage, filteredIdeas.length);

  const saveInsightToFirebase = async (answers, contactInfo, matchedIdeaIds) => {
    const isEmail = /\S+@\S+\.\S+/.test(contactInfo.contact);
    let currentUser = auth.currentUser || user;

    if (!currentUser) {
      try {
        const credential = await signInAnonymously(auth);
        currentUser = credential.user;
      } catch (error) {
        console.error('Không thể xác thực ẩn danh trước khi lưu dữ liệu:', error);
      }
    }

    const writeTasks = [];

    if (currentUser) {
      const insightRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'quiz_results');
      writeTasks.push(
        addDoc(insightRef, {
          answers,
          contactInfo,
          matchedIdeaIds,
          createdAt: serverTimestamp(),
          source: '3c_form_v2',
        }),
      );
    }

    const leadsRef = collection(db, 'artifacts', appId, 'public', 'data', 'leads');
    writeTasks.push(
      addDoc(leadsRef, {
        name: contactInfo.name,
        contactMethod: isEmail ? 'email' : 'zalo',
        contactValue: contactInfo.contact,
        location: contactInfo.city,
        submittedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        source: '3c_form_v2',
        stage: '',
        topic: '',
        clickedMagnet: false,
        filters: answers,
        matchedIdeaIds,
        userId: currentUser?.uid || null,
      }),
    );

    const results = await Promise.allSettled(writeTasks);
    const failedWrites = results.filter((result) => result.status === 'rejected');
    if (failedWrites.length === writeTasks.length) {
      throw failedWrites[0].reason;
    }
    if (failedWrites.length > 0) {
      console.error('Một số bản ghi Firebase không lưu được:', failedWrites);
    }
  };

  const hasAllFiltersSelected = Boolean(filters.capital && filters.competence && filters.time);
  const hasAnyFilterSelected = Boolean(filters.capital || filters.competence || filters.time);

  const getIdeaShareUrl = (ideaId) => {
    const url = new URL(window.location.href);
    url.searchParams.set('idea', String(ideaId));
    return url.toString();
  };

  const copyTextToClipboard = async (text) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  };

  const isMobileShareContext = () => {
    const ua = navigator.userAgent || '';
    const mobileUA = /Android|iPhone|iPad|iPod|Windows Phone|Mobile/i.test(ua);
    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
    return mobileUA || coarsePointer;
  };

  const markIdeaAsCopied = (ideaId) => {
    setCopiedIdeaId(ideaId);
    if (shareToastTimeoutRef.current) {
      clearTimeout(shareToastTimeoutRef.current);
    }
    shareToastTimeoutRef.current = setTimeout(() => setCopiedIdeaId(null), 2200);
  };

  const handleShareIdea = async (idea, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const url = getIdeaShareUrl(idea.id);
    const sharePayload = {
      title: `Ý tưởng khởi nghiệp: ${idea.title}`,
      text: `Mình thấy ý tưởng này hay, xem thử nhé: ${idea.title}`,
      url,
    };

    if (isMobileShareContext() && navigator.share) {
      try {
        await navigator.share(sharePayload);
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
        console.error('Không thể mở trình chia sẻ hệ thống:', error);
      }
    }

    try {
      await copyTextToClipboard(url);
      markIdeaAsCopied(idea.id);
    } catch (error) {
      console.error('Không thể sao chép liên kết:', error);
      window.prompt('Sao chép liên kết này:', url);
    }
  };

  const getSelectedOptionLabel = (questionId, value) => {
    const question = quizQuestions.find((q) => q.id === questionId);
    const option = question?.options.find((opt) => opt.value === value);
    return option?.label || 'Chưa chọn';
  };

  const resetQuizFlow = () => {
    setFilters(initialFilters);
    setLeadForm(initialLeadForm);
    setLeadErrors({});
    setTopIdeas([]);
    setQuizStep('select');
    setIsSubmitting(false);
  };

  const resetQuizSelections = () => {
    setFilters(initialFilters);
    setLeadErrors({});
    setTopIdeas([]);
    setQuizStep('select');
  };

  const clearSearch = () => {
    setSearchTerm('');
    setCurrentPage(1);
  };

  const handleComingSoon = (e) => {
    if (e) e.preventDefault();
    setShowComingSoon(true);
  };

  const closeComingSoon = (targetId) => {
    setShowComingSoon(false);
    if (targetId) {
      setTimeout(() => {
        document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    }
  };

  const handleContinueToContact = () => {
    if (!hasAllFiltersSelected) return;
    setQuizStep('contact');
  };

  const handleLeadInputChange = (field, value) => {
    setLeadForm((prev) => ({ ...prev, [field]: value }));
    setLeadErrors((prev) => {
      if (!prev[field] && !prev.submit) return prev;
      const next = { ...prev };
      delete next[field];
      delete next.submit;
      return next;
    });
  };

  const validateLeadForm = () => {
    const trimmed = {
      name: leadForm.name.trim(),
      contact: leadForm.contact.trim(),
      city: leadForm.city.trim(),
    };
    const errors = {};
    if (!trimmed.name) errors.name = 'Vui lòng nhập họ tên.';
    if (!trimmed.contact) errors.contact = 'Vui lòng nhập email hoặc số điện thoại.';
    if (!trimmed.city) errors.city = 'Vui lòng nhập thành phố đang sinh sống.';
    return { trimmed, errors };
  };

  const handleSubmitLead = async (e) => {
    e.preventDefault();
    if (!hasAllFiltersSelected || isSubmitting) return;

    const { trimmed, errors } = validateLeadForm();
    if (Object.keys(errors).length > 0) {
      setLeadErrors(errors);
      return;
    }

    const answers = { ...filters };
    const matchedIdeas = scoreIdeasByAnswers(answers).slice(0, 3);
    const matchedIdeaIds = matchedIdeas.map((idea) => idea.id);

    setLeadErrors({});
    setLeadForm(trimmed);
    setQuizStep('processing');
    setIsSubmitting(true);

    const [saveResult] = await Promise.allSettled([
      saveInsightToFirebase(answers, trimmed, matchedIdeaIds),
      new Promise((resolve) => setTimeout(resolve, 1200)),
    ]);

    if (saveResult.status === 'rejected') {
      console.error('Lỗi khi lưu thông tin lead:', saveResult.reason);
      setLeadErrors({
        submit: 'Không thể lưu dữ liệu lúc này. Vui lòng kiểm tra kết nối và thử lại.',
      });
      setQuizStep('contact');
      setIsSubmitting(false);
      return;
    }

    setTopIdeas(matchedIdeas);
    setQuizStep('results');
    setIsSubmitting(false);
  };

  /* ----------------------- RENDER ----------------------- */
  return (
    <div className="min-h-screen bg-[#f6f8f6] text-slate-900 font-[Be_Vietnam_Pro,sans-serif] selection:bg-[#16a738] selection:text-white">

      {/* --- HEADER --- */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-200/60 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-10">
            <a
              href="#"
              className="flex items-center gap-2.5 group"
              onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            >
              <img src="/logo.png" alt="Thợ Khởi Nghiệp" className="h-8 w-8 object-contain rounded-lg" />
              <span className="text-lg font-extrabold tracking-tight text-slate-900 group-hover:text-[#16a738] transition-colors">Thợ Khởi Nghiệp</span>
            </a>
            <nav className="hidden md:flex items-center gap-1">
              <a href="#library" className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all focus-visible:ring-2 focus-visible:ring-[#16a738]/30">Thư viện</a>
              <button type="button" onClick={handleComingSoon} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all focus-visible:ring-2 focus-visible:ring-[#16a738]/30">Tài nguyên</button>
              <button type="button" onClick={handleComingSoon} className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all focus-visible:ring-2 focus-visible:ring-[#16a738]/30">Về chúng tôi</button>
            </nav>
          </div>
          <a
            href="#quiz"
            className="rounded-lg border border-[#16a738]/30 bg-[#16a738]/10 px-5 py-2 text-sm font-bold text-[#16a738] hover:bg-[#16a738]/15 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#16a738]"
          >
            Tìm ý tưởng
          </a>
        </div>
      </header>

      {/* --- HERO SECTION with gradient background --- */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-green-100/60 via-green-50/30 to-[#f6f8f6] pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-[#16a738]/[0.06] rounded-full blur-[120px] pointer-events-none" />

        <div className="relative mx-auto max-w-7xl px-6 pt-12 pb-16">
        {/* --- HERO SECTION --- */}
        <section className="flex flex-col items-center text-center pt-8 pb-4">
            {/* Badge pill */}
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 border border-slate-200 px-5 py-2 mb-8 backdrop-blur-sm shadow-sm">
              <span className="text-base">✦</span>
              <span className="text-sm font-medium text-slate-700">Công cụ tìm ý tưởng khởi nghiệp</span>
            </div>

            {/* Headline */}
            <h1
              className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-[1.08] tracking-tight mx-auto max-w-4xl mb-6"
              style={{ textWrap: 'balance' }}
            >
              Tìm{' '}
              <span className="font-black text-[#16a738]">ý tưởng kinh doanh</span>{' '}
              <span className="font-black text-[#16a738]">phù hợp</span>{' '}
              với nguồn lực của bạn
            </h1>

            {/* Description */}
            <p className="text-lg sm:text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed mb-10">
              Trả lời 3 câu hỏi về Vốn — Năng lực — Thời gian, hệ thống lọc ra mô hình kinh doanh thực tế kèm với phân tích chi tiết phù hợp với bạn
            </p>

            {/* CTA */}
            <div className="flex flex-wrap items-center justify-center gap-4 mb-12">
              <a
                href="#quiz"
                className="group inline-flex items-center gap-2 rounded-xl bg-[#16a738] px-8 py-4 text-base font-bold text-white hover:bg-[#128a2e] transition-all shadow-lg shadow-[#16a738]/20 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#16a738]"
              >
                Làm bài test miễn phí
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </a>
              <a
                href="#library"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-8 py-4 text-base font-bold text-slate-800 hover:bg-slate-50 hover:border-slate-400 transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400"
              >
                Xem {ideaDatabase.length}+ ý tưởng
              </a>
            </div>

            {/* Mini stats */}
            <div className="flex items-center justify-center gap-10 sm:gap-14">
              <div>
                <p className="text-2xl font-extrabold text-slate-900">{ideaDatabase.length}+</p>
                <p className="text-xs text-slate-500 font-medium mt-0.5">Ý tưởng sẵn sàng</p>
              </div>
              <div className="w-px h-8 bg-slate-200" />
              <div>
                <p className="text-2xl font-extrabold text-slate-900">10+</p>
                <p className="text-xs text-slate-500 font-medium mt-0.5">Ngành nghề</p>
              </div>
              <div className="w-px h-8 bg-slate-200" />
              <div>
                <p className="text-2xl font-extrabold text-slate-900">100%</p>
                <p className="text-xs text-slate-500 font-medium mt-0.5">Miễn phí</p>
              </div>
            </div>
        </section>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-6 py-12">
        {/* --- 3C QUIZ / FILTER SECTION --- */}
        <section className="mb-24 scroll-mt-24" id="quiz">
          <div className="mb-10 text-center">
            <h2 className="text-4xl font-extrabold mb-4">Công cụ Phân tích 3C</h2>
            <p className="font-bold text-slate-500">Khám phá ý tưởng phù hợp với nguồn lực của bạn</p>
          </div>

          <div className="mx-auto max-w-6xl rounded-3xl border border-[#16a738]/20 bg-white/95 p-6 md:p-8 shadow-[0_18px_45px_-22px_rgba(22,167,56,0.45)] backdrop-blur">
            {quizStep === 'select' && (
              <>
                <div className="mb-8 text-center">
                  <p className="text-sm font-bold uppercase tracking-wider text-[#16a738]">Bước 1 / 3</p>
                  <h3 className="text-2xl md:text-3xl font-extrabold mt-2">Chọn đầy đủ 3 tiêu chí 3C</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {quizQuestions.map((q) => {
                    const cfg = filterCardConfig[q.id];
                    return (
                        <div
                          key={q.id}
                          className={`${cfg.bgCard} p-8 rounded-2xl flex flex-col min-h-[350px] border border-[#16a738]/20 shadow-[0_12px_24px_-18px_rgba(22,167,56,0.55)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_18px_32px_-18px_rgba(22,167,56,0.65)]`}
                        >
                        <div className="flex items-center gap-3 mb-6">
                          <span className={cfg.iconColor}>{cfg.icon}</span>
                          <h4 className="text-2xl font-extrabold uppercase tracking-tighter">{cfg.label}</h4>
                        </div>

                        {q.id === 'competence' ? (
                          <div className="grid grid-cols-2 gap-3">
                            {q.options.map((opt) => {
                              const sel = filters[q.id] === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => handleFilterChange(q.id, opt.value)}
                                  className={`flex flex-col items-center justify-center p-4 border border-[#16a738]/30 rounded-xl cursor-pointer transition-colors text-center ${
                                    sel ? `${cfg.bgSelected} text-white` : `bg-white ${cfg.hoverBg}`
                                  }`}
                                >
                                  <span className="mb-2">{getIcon(opt.icon, 'w-6 h-6')}</span>
                                  <span className="font-bold text-xs">{opt.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {q.options.map((opt) => {
                              const sel = filters[q.id] === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => handleFilterChange(q.id, opt.value)}
                                  className={`flex items-center gap-3 w-full p-4 border border-[#16a738]/30 rounded-xl cursor-pointer transition-colors text-left ${
                                    sel ? `${cfg.bgSelected} text-white` : `bg-white ${cfg.hoverBg}`
                                  }`}
                                >
                                  <span className={sel ? '' : cfg.iconColor}>{getIcon(opt.icon, 'w-5 h-5')}</span>
                                  <span className="font-bold">{opt.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {hasAnyFilterSelected && filters[q.id] && (
                          <button
                            type="button"
                            onClick={() => handleFilterChange(q.id, filters[q.id])}
                            className="mt-auto pt-4 text-xs font-semibold text-[#0f6c24] hover:text-[#128a2e] transition-colors flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" /> Bỏ chọn
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-8 flex flex-wrap justify-center items-center gap-3">
                  <button
                    type="button"
                    onClick={handleContinueToContact}
                    disabled={!hasAllFiltersSelected}
                    className={`inline-flex items-center gap-2 rounded-xl px-7 py-3 text-sm font-bold text-white transition-all ${
                      hasAllFiltersSelected
                        ? 'bg-[#16a738] hover:bg-[#16a738]/90 shadow-lg shadow-[#16a738]/25'
                        : 'bg-slate-300 cursor-not-allowed'
                    }`}
                  >
                    Tiếp tục nhập thông tin <ChevronRight className="w-4 h-4" />
                  </button>

                  {hasAnyFilterSelected && (
                    <button
                      type="button"
                      onClick={resetQuizSelections}
                      className="rounded-xl border border-[#16a738]/35 bg-white px-6 py-3 text-sm font-bold text-[#0f6c24] shadow-[0_12px_24px_-16px_rgba(22,167,56,0.55)] transition-all hover:bg-[#16a738]/5 inline-flex items-center gap-2"
                    >
                      <RotateCcw className="w-4 h-4" /> Xóa lựa chọn
                    </button>
                  )}
                </div>

                {!hasAllFiltersSelected && (
                  <p className="mt-4 text-center text-sm text-slate-500">
                    Hãy chọn đủ 3 phương án để chuyển sang bước nhập thông tin.
                  </p>
                )}
              </>
            )}

            {quizStep === 'contact' && (
              <div className="mx-auto max-w-2xl">
                <div className="mb-6 text-center">
                  <p className="text-sm font-bold uppercase tracking-wider text-[#16a738]">Bước 2 / 3</p>
                  <h3 className="text-2xl md:text-3xl font-extrabold mt-2">Điền thông tin liên hệ</h3>
                </div>

                <div className="mb-8 flex flex-wrap justify-center gap-2">
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                    Vốn: {getSelectedOptionLabel('capital', filters.capital)}
                  </span>
                  <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
                    Năng lực: {getSelectedOptionLabel('competence', filters.competence)}
                  </span>
                  <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700">
                    Thời gian: {getSelectedOptionLabel('time', filters.time)}
                  </span>
                </div>

                <form className="space-y-5" onSubmit={handleSubmitLead}>
                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-700">Họ tên</label>
                    <input
                      className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none focus:border-[#16a738] focus:ring-2 focus:ring-[#16a738]/20"
                      placeholder="Nhập họ tên của bạn"
                      value={leadForm.name}
                      onChange={(e) => handleLeadInputChange('name', e.target.value)}
                    />
                    {leadErrors.name && <p className="mt-1 text-xs font-medium text-red-500">{leadErrors.name}</p>}
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-700">Email / SĐT liên hệ</label>
                    <input
                      className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none focus:border-[#16a738] focus:ring-2 focus:ring-[#16a738]/20"
                      placeholder="vd: email@domain.com hoặc 09xxxxxxxx"
                      value={leadForm.contact}
                      onChange={(e) => handleLeadInputChange('contact', e.target.value)}
                    />
                    {leadErrors.contact && <p className="mt-1 text-xs font-medium text-red-500">{leadErrors.contact}</p>}
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-700">Thành phố sinh sống</label>
                    <input
                      className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none focus:border-[#16a738] focus:ring-2 focus:ring-[#16a738]/20"
                      placeholder="Ví dụ: TP.HCM, Hà Nội..."
                      value={leadForm.city}
                      onChange={(e) => handleLeadInputChange('city', e.target.value)}
                    />
                    {leadErrors.city && <p className="mt-1 text-xs font-medium text-red-500">{leadErrors.city}</p>}
                  </div>

                  {leadErrors.submit && (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
                      {leadErrors.submit}
                    </p>
                  )}

                  <div className="flex flex-wrap justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setQuizStep('select')}
                      className="rounded-xl border border-[#16a738]/35 bg-white px-6 py-3 text-sm font-bold text-[#0f6c24] shadow-[0_12px_24px_-16px_rgba(22,167,56,0.55)] transition-all hover:bg-[#16a738]/5"
                    >
                      Quay lại
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#16a738] px-7 py-3 text-sm font-bold text-white shadow-lg shadow-[#16a738]/25 hover:bg-[#16a738]/90 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                    >
                      <Send className="w-4 h-4" /> Gửi để lọc ý tưởng
                    </button>
                  </div>
                </form>
              </div>
            )}

            {quizStep === 'processing' && (
              <div className="py-20 text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#16a738]/10">
                  <RotateCcw className="h-8 w-8 animate-spin text-[#16a738]" />
                </div>
                <h3 className="text-2xl font-extrabold">Đang xử lý bộ lọc...</h3>
                <p className="mt-2 text-slate-500">Hệ thống đang tìm ra 3 ý tưởng phù hợp nhất với hồ sơ của bạn.</p>
              </div>
            )}

            {quizStep === 'results' && (
              <>
                <div className="mb-8 text-center">
                  <p className="text-sm font-bold uppercase tracking-wider text-[#16a738]">Bước 3 / 3</p>
                  <h3 className="text-2xl md:text-3xl font-extrabold mt-2">Top 3 ý tưởng phù hợp nhất</h3>
                  <p className="mt-2 text-sm text-slate-500">Nhấn vào từng thẻ để mở phần phân tích chi tiết.</p>
                </div>

                {topIdeas.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
                    <p className="text-slate-600">Hiện chưa có gợi ý phù hợp. Vui lòng thử lại bộ lọc khác.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {topIdeas.map((idea, index) => {
                      const capitalItem = idea.deck.financial.find((f) => f.highlight);
                      return (
                        <div
                          key={idea.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedIdea(idea)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedIdea(idea);
                            }
                          }}
                          className="cursor-pointer text-left group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-xl hover:-translate-y-1 transition-all focus:outline-none focus:ring-2 focus:ring-[#16a738]/20"
                        >
                          <div className="mb-4 flex items-center justify-between gap-3">
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#16a738]/10 px-3 py-1 text-xs font-bold text-[#16a738]">
                              <Star className="w-3 h-3 fill-current" /> Top {index + 1}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => handleShareIdea(idea, e)}
                                className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:border-[#16a738] hover:text-[#16a738]"
                                aria-label={`Share ${idea.title}`}
                              >
                                <Share2 className="w-3.5 h-3.5" />
                                {copiedIdeaId === idea.id ? 'Đã copy' : 'Share'}
                              </button>
                              <span className="text-xs font-bold text-slate-400 uppercase">{idea.industry.split(',')[0]}</span>
                            </div>
                          </div>
                          <h4 className="text-xl font-extrabold leading-tight group-hover:text-[#16a738] transition-colors">{idea.title}</h4>
                          <p className="mt-3 text-sm text-slate-500 line-clamp-2">{idea.shortDesc}</p>
                          <div className="mt-5 pt-4 border-t border-slate-100 text-sm text-slate-600">
                            <span className="font-bold text-slate-800">Vốn dự kiến:</span> {capitalItem ? capitalItem.detail : '—'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-8 text-center">
                  <button
                    type="button"
                    onClick={resetQuizFlow}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#16a738]/35 bg-white px-6 py-3 text-sm font-bold text-[#0f6c24] shadow-[0_12px_24px_-16px_rgba(22,167,56,0.55)] transition-all hover:bg-[#16a738]/5"
                  >
                    <RotateCcw className="w-4 h-4" /> Làm lại bộ lọc
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        {/* --- IDEA LIBRARY --- */}
        <section className="mb-24" id="library">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
            <div className="max-w-2xl">
              <h2 className="text-4xl font-extrabold mb-4">Thư viện Ý tưởng "Mở"</h2>
              <p className="text-slate-500 text-lg">
                Đang hiển thị <span className="font-extrabold text-[#16a738]">{firstIdeaIndex}-{lastIdeaIndex}</span> trên tổng{' '}
                <span className="font-extrabold text-[#16a738]">{filteredIdeas.length}</span> mô hình kinh doanh thực chiến, minh bạch và có thể triển khai ngay.
              </p>
            </div>
            {/* Mobile search */}
            <div className="sm:hidden relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                className="w-full h-10 rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#16a738]/20 outline-none"
                placeholder="Tìm ý tưởng..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>

          {filteredIdeas.length === 0 ? (
            <div className="border-2 border-slate-900 shadow-[4px_4px_0px_#111713] bg-white rounded-2xl p-16 text-center">
              <Search className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-extrabold text-slate-600 mb-2">Không tìm thấy ý tưởng nào</h3>
              <p className="text-slate-400 text-sm mb-6">Hãy thử thay đổi từ khóa tìm kiếm.</p>
              <button
                onClick={clearSearch}
                className="border-2 border-slate-900 shadow-[3px_3px_0px_#111713] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none rounded-xl bg-[#16a738] px-6 py-3 font-bold text-white text-sm"
              >
                Xóa từ khóa
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {paginatedIdeas.map((idea) => {
                const capitalItem = idea.deck.financial.find((f) => f.highlight);
                return (
                  <div
                    key={idea.id}
                    onClick={() => setSelectedIdea(idea)}
                    className="group flex flex-col bg-white rounded-3xl overflow-hidden border border-slate-200 hover:shadow-2xl hover:-translate-y-2 transition-all cursor-pointer relative"
                  >
                    {/* Icon header area */}
                    <div className="h-48 relative overflow-hidden bg-gradient-to-br from-[#16a738]/5 to-[#16a738]/15 flex items-center justify-center">
                      <div className="w-20 h-20 rounded-2xl bg-white/80 border border-[#16a738]/20 flex items-center justify-center text-[#16a738] group-hover:scale-110 transition-transform duration-500">
                        {getIcon(idea.icon, 'w-10 h-10')}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleShareIdea(idea, e)}
                        className="absolute top-4 left-4 inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-slate-600 border border-slate-200 hover:border-[#16a738] hover:text-[#16a738]"
                        aria-label={`Share ${idea.title}`}
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        {copiedIdeaId === idea.id ? 'Đã copy' : 'Share'}
                      </button>
                      <div className="absolute top-4 right-4 bg-[#16a738]/10 text-[#16a738] text-xs font-bold px-3 py-1.5 rounded-full uppercase">
                        {idea.industry.split(',')[0]}
                      </div>
                    </div>
                    {/* Card body */}
                    <div className="p-6 flex flex-col flex-1">
                      <h3 className="text-2xl font-extrabold mb-3 group-hover:text-[#16a738] transition-colors">
                        {idea.title}
                      </h3>
                      <p className="text-slate-500 text-sm mb-6 line-clamp-2">{idea.shortDesc}</p>
                      <div className="space-y-3 mb-6">
                        <div className="flex items-center gap-3 text-sm">
                          <Star className="w-4 h-4 text-[#16a738] flex-shrink-0" />
                          <span className="font-bold">Tiềm năng:</span>
                          <span className="text-slate-600">{idea.potential}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <Target className="w-4 h-4 text-[#16a738] flex-shrink-0" />
                          <span className="font-bold">Độ khó:</span>
                          <span className="text-slate-600">{idea.difficulty}</span>
                        </div>
                      </div>
                      <div className="mt-auto pt-6 border-t border-slate-100 flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-xs uppercase font-bold text-slate-400">Vốn dự kiến</span>
                          <span className="text-lg font-extrabold text-[#16a738]">
                            {capitalItem ? capitalItem.detail : '—'}
                          </span>
                        </div>
                        <div className="h-10 w-10 rounded-full bg-[#16a738]/10 text-[#16a738] hover:bg-[#16a738] hover:text-white transition-all flex items-center justify-center">
                          <ArrowRight className="w-5 h-5" />
                        </div>
                      </div>
                    </div>
                  </div>
                );
                })}
              </div>
              {filteredIdeas.length > ideasPerPage && (
                <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(Math.max(1, safeCurrentPage - 1))}
                    disabled={safeCurrentPage === 1}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-50"
                  >
                    Trước
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      className={`h-10 w-10 rounded-lg border text-sm font-bold transition-colors ${
                        safeCurrentPage === page
                          ? 'border-[#16a738] bg-[#16a738] text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                      aria-label={`Trang ${page}`}
                      aria-current={safeCurrentPage === page ? 'page' : undefined}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCurrentPage(Math.min(totalPages, safeCurrentPage + 1))}
                    disabled={safeCurrentPage === totalPages}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-50"
                  >
                    Sau
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      {/* --- FOOTER --- */}
      <footer className="bg-white border-t border-[#16a738]/10 pt-20 pb-10">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            <div>
              <div className="flex items-center gap-2 text-[#16a738] mb-6">
                <img src="/logo.png" alt="Thợ Khởi Nghiệp" className="h-10 w-10 object-contain rounded-md" />
                <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Thợ Khởi Nghiệp</h2>
              </div>
              <p className="text-slate-500 text-sm leading-relaxed">
                Nền tảng hỗ trợ khởi nghiệp thực chiến đầu tiên dành cho người Việt. Mọi ý tưởng đều có thể trở thành hiện thực nếu có lộ trình đúng đắn.
              </p>
            </div>
            <div>
              <h4 className="font-bold mb-6">Liên kết</h4>
              <ul className="space-y-4 text-sm text-slate-500">
                <li><a href="#library" className="hover:text-[#16a738] transition-colors">Thư viện ý tưởng</a></li>
                <li><button type="button" onClick={handleComingSoon} className="hover:text-[#16a738] transition-colors text-left">Tài liệu miễn phí</button></li>
                <li><button type="button" onClick={handleComingSoon} className="hover:text-[#16a738] transition-colors text-left">Cộng đồng</button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-6">Pháp lý</h4>
              <ul className="space-y-4 text-sm text-slate-500">
                <li><button type="button" onClick={handleComingSoon} className="hover:text-[#16a738] transition-colors text-left">Điều khoản dịch vụ</button></li>
                <li><button type="button" onClick={handleComingSoon} className="hover:text-[#16a738] transition-colors text-left">Chính sách bảo mật</button></li>
                <li><button type="button" onClick={handleComingSoon} className="hover:text-[#16a738] transition-colors text-left">Bản quyền mã nguồn</button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-6">Nhận bản tin</h4>
              <p className="text-sm text-slate-500 mb-4">Cập nhật ý tưởng kinh doanh mới hàng tuần.</p>
              <div className="flex gap-2">
                <input className="flex-1 rounded-lg border border-slate-200 text-sm px-3 py-2 focus:ring-[#16a738] focus:border-[#16a738] outline-none" placeholder="Email của bạn" />
                <button className="rounded-lg bg-[#16a738] p-2 text-white hover:bg-[#16a738]/90 transition-colors">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          <div className="border-t border-slate-100 pt-8 text-center text-slate-400 text-xs">
            © 2026 Thợ Khởi Nghiệp. All rights reserved. | Dữ liệu mở
          </div>
        </div>
      </footer>

      {/* --- DETAIL MODAL --- */}
      {selectedIdea && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
          <div
            className="bg-[#f6f8f6] rounded-2xl overflow-hidden flex flex-col relative w-full max-w-6xl max-h-[95vh] border border-slate-200 shadow-2xl animate-[slideUp_0.3s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedIdea(null)}
              className="absolute top-4 right-4 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md text-slate-500 hover:text-red-500 hover:bg-red-50 transition-colors z-50 border border-slate-200 focus:outline-none"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="overflow-y-auto p-6 sm:p-10 custom-scrollbar">
              <div className="text-center mb-8 pr-12 sm:pr-0">
                <span className="inline-flex items-center px-4 py-1.5 rounded-full bg-[#16a738]/10 text-[#16a738] text-xs sm:text-sm font-bold uppercase tracking-wider">
                  Ý tưởng khởi nghiệp
                </span>
                <h1 className="text-3xl sm:text-5xl font-extrabold text-[#16a738] mt-4 mb-3 leading-tight">{selectedIdea.title}</h1>
                <p className="text-slate-600 text-base sm:text-lg max-w-4xl mx-auto">{selectedIdea.shortDesc}</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="bg-white p-6 rounded-2xl border border-[#16a738]/15 shadow-sm">
                  <h3 className="text-xl font-bold text-[#16a738] mb-3 flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-[#16a738]/70" /> Cốt lõi
                  </h3>
                  <p className="text-slate-700 leading-relaxed">{selectedIdea.deck.core}</p>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-[#16a738]/15 shadow-sm">
                  <h3 className="text-xl font-bold text-[#16a738] mb-3 flex items-center gap-2">
                    <Users className="w-5 h-5 text-[#16a738]/70" /> Khách hàng
                  </h3>
                  <ul className="space-y-2 text-slate-700">
                    {selectedIdea.deck.customer.map((item, idx) => (
                      <li key={idx}>• {item}</li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-[#16a738]/15 shadow-sm">
                  <h3 className="text-xl font-bold text-[#16a738] mb-3 flex items-center gap-2">
                    <Star className="w-5 h-5 text-[#16a738]/70" /> Khác biệt
                  </h3>
                  <p className="text-slate-700 leading-relaxed">{selectedIdea.deck.differentiation}</p>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-[#16a738]/15 shadow-sm lg:col-span-2">
                  <h3 className="text-xl font-bold text-[#16a738] mb-3 flex items-center gap-2">
                    <FileBarChart2 className="w-5 h-5 text-[#16a738]/70" /> Phân tích tài chính
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr>
                          <th className="bg-[#16a738] text-white text-left px-4 py-3 font-semibold rounded-tl-xl">Hạng mục</th>
                          <th className="bg-[#16a738] text-white text-left px-4 py-3 font-semibold rounded-tr-xl">Chi tiết / Ước tính</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedIdea.deck.financial.map((row, idx) => (
                          <tr key={idx} className="border-b border-slate-100 last:border-b-0">
                            <td className="px-4 py-3 font-semibold text-slate-800">{row.item}</td>
                            <td className="px-4 py-3 text-slate-700">
                              {row.highlight ? <span className="text-[#16a738] font-bold">{row.detail}</span> : row.detail}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-[#16a738]/15 shadow-sm">
                  <h3 className="text-xl font-bold text-[#16a738] mb-3 flex items-center gap-2">
                    <Target className="w-5 h-5 text-[#16a738]/70" /> Rủi ro & khó khăn
                  </h3>
                  <ul className="space-y-2 text-slate-700 text-sm leading-relaxed">
                    {selectedIdea.deck.risks.map((risk, idx) => (
                      <li key={idx}>• {risk}</li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-[#16a738]/15 shadow-sm lg:col-span-3">
                  <h3 className="text-xl font-bold text-[#16a738] mb-3 flex items-center gap-2">
                    <ArrowRight className="w-5 h-5 text-[#16a738]/70" /> Chiến lược kênh phân phối & bán hàng
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm min-w-[680px]">
                      <thead>
                        <tr>
                          <th className="bg-[#16a738] text-white text-left px-4 py-3 font-semibold rounded-tl-xl">Loại hình</th>
                          <th className="bg-[#16a738] text-white text-left px-4 py-3 font-semibold">Kênh triển khai</th>
                          <th className="bg-[#16a738] text-white text-left px-4 py-3 font-semibold rounded-tr-xl">Mô tả hoạt động</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedIdea.deck.channels.map((row, idx) => (
                          <tr key={idx} className="border-b border-slate-100 last:border-b-0">
                            <td className="px-4 py-3 font-semibold text-[#16a738]">{row.type}</td>
                            <td className="px-4 py-3 font-semibold text-slate-800">{row.channel}</td>
                            <td className="px-4 py-3 text-slate-700 leading-relaxed">{row.action}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-[#16a738]/15 shadow-sm lg:col-span-3">
                  <h3 className="text-xl font-bold text-[#16a738] mb-3 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-[#16a738]/70" /> Tiềm năng phát triển
                  </h3>
                  <p className="text-slate-700 leading-relaxed">{selectedIdea.deck.growth}</p>
                </div>
              </div>
            </div>

            <div className="bg-white py-4 text-center text-xs text-slate-500 font-medium border-t border-slate-200 flex-shrink-0">
              © 2026 - Thợ Khởi Nghiệp | Dữ liệu mở
            </div>
          </div>

          <div className="absolute inset-0 -z-10" onClick={() => setSelectedIdea(null)} />
        </div>
      )}

      {/* --- COMING SOON MODAL --- */}
      {showComingSoon && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]">
          <div
            className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center animate-[slideUp_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
              <Rocket className="w-7 h-7 text-amber-500" />
            </div>
            <h3 className="text-xl font-extrabold text-slate-900 mb-2">Sắp ra mắt!</h3>
            <p className="text-sm text-slate-500 leading-relaxed mb-6">
              Tính năng này đang được phát triển. Hãy khám phá các công cụ đã sẵn sàng bên dưới.
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => closeComingSoon('quiz')}
                className="w-full rounded-xl bg-[#16a738] px-5 py-3 text-sm font-bold text-white hover:bg-[#128a2e] transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#16a738]"
              >
                Tìm ý tưởng phù hợp
              </button>
              <button
                type="button"
                onClick={() => closeComingSoon('library')}
                className="w-full rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400"
              >
                Xem thư viện ý tưởng
              </button>
              <button
                type="button"
                onClick={() => setShowComingSoon(false)}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors mt-1 py-1"
              >
                Đóng
              </button>
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onClick={() => setShowComingSoon(false)} />
        </div>
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

            .custom-scrollbar::-webkit-scrollbar { width: 6px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #16a738; }
          `,
        }}
      />
    </div>
  );
}
