import React, { useState, useEffect } from 'react';
import { BookOpen, TrendingUp, Users, CheckCircle, ArrowRight, ShieldCheck, MapPin, Target, HelpCircle, User, Smartphone, Mail, Sparkles, Lightbulb, Zap, ExternalLink } from 'lucide-react';
import { collection, addDoc, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged} from 'firebase/auth';
import { db, auth, appId } from './firebase';
import logoImage from './assets/logo.png';

// --- CONFIGURATION ---
// Lưu ý: Trong môi trường thực tế, API Key nên được bảo vệ ở backend.
const API_KEY = import.meta.env.VITE_GEMINI_KEY;
const LEAD_MAGNET_URL = "https://docs.google.com/spreadsheets/d/1T_C8jyUaDQ7GhuiwRlmbxhmGiRG-RpC20_u-PdSQY5s/edit?gid=1377980842#gid=1377980842";

// Custom Logo Component: Logo ảnh thật
const LogoBrick = () => (
  <img 
    src={logoImage} 
    alt="Thợ Khởi Nghiệp Logo" 
    className="w-10 h-10 object-contain" 
  />
);

const LandingPage = () => {
  // --- STATE FOR AUTH & USER ---
  const [user, setUser] = useState(null);

  // --- STATE FOR MAIN FORM ---
  const [contactMethod, setContactMethod] = useState('email'); 
  const [formData, setFormData] = useState({
    contactValue: '',
    location: '',
    stage: '',
    topic: '',
    otherTopic: '',
    otherLocation: '',
    age: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');
  
  // --- STATE FOR TRACKING ---
  const [leadId, setLeadId] = useState(null); // Lưu ID của lead vừa tạo
  const [isTrackingClick, setIsTrackingClick] = useState(false);

  // --- STATE FOR GEMINI AI FEATURE ---
  const [aiKeyword, setAiKeyword] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState('');

// --- AUTH INITIALIZATION (Phiên bản Localhost) ---
  useEffect(() => {
    // Chỉ cần đăng nhập ẩn danh đơn giản
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Lỗi đăng nhập ẩn danh:", error);
      }
    };
    initAuth();
    
    // Lắng nghe trạng thái người dùng
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // --- HANDLERS FOR MAIN FORM ---
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
        setSubmitError("Đang kết nối hệ thống, vui lòng thử lại sau giây lát...");
        return;
    }
    
    // Validate required fields
    if (!formData.location) {
      setSubmitError('Vui lòng chọn nơi bạn ở.');
      return;
    }
    if (!formData.age) {
      setSubmitError('Vui lòng chọn độ tuổi.');
      return;
    }
    if (!formData.stage) {
      setSubmitError('Vui lòng chọn giai đoạn hiện tại.');
      return;
    }
    if (!formData.topic) {
      setSubmitError('Vui lòng chọn chủ đề quan tâm.');
      return;
    }
    if (formData.location === 'Khác' && !formData.otherLocation.trim()) {
      setSubmitError('Vui lòng nhập nơi bạn ở.');
      return;
    }
    if (formData.topic === 'khac' && !formData.otherTopic.trim()) {
      setSubmitError('Vui lòng nhập chủ đề bạn quan tâm.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
        // Gửi dữ liệu lên Firestore và LẤY VỀ Reference (để biết ID)
        const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'leads'), {
            ...formData,
            contactMethod,
            submittedAt: serverTimestamp(),
            source: 'landing_page_v2',
            userId: user.uid,
            clickedMagnet: false // Mặc định là chưa click
        });

        setLeadId(docRef.id); // Lưu lại ID để dùng cho việc tracking click sau này
        setIsSubmitting(false);
        setIsSuccess(true);
    } catch (error) {
        console.error("Lỗi gửi form:", error);
        setSubmitError("Có lỗi xảy ra. Vui lòng kiểm tra kết nối mạng.");
        setIsSubmitting(false);
    }
  };

  // --- TRACKING HANDLER ---
  const handleOpenSheet = (e) => {
    e.preventDefault();
    setIsTrackingClick(true);

    // Open immediately inside user gesture to avoid mobile popup blocking.
    const newTab = window.open(LEAD_MAGNET_URL, '_blank', 'noopener,noreferrer');
    if (!newTab) {
      window.location.assign(LEAD_MAGNET_URL);
    }

    if (!leadId) {
      setIsTrackingClick(false);
      return;
    }

    const leadRef = doc(db, 'artifacts', appId, 'public', 'data', 'leads', leadId);
    updateDoc(leadRef, {
      clickedMagnet: true,
      clickedAt: serverTimestamp()
    })
      .catch((err) => {
        console.error("Tracking error:", err);
      })
      .finally(() => {
        setIsTrackingClick(false);
      });
  };

  // --- GEMINI AI FUNCTION ---
  const generateStartupIdea = async () => {
    if (!aiKeyword.trim()) return;
    
    setAiLoading(true);
    setAiResult(null);
    setAiError('');

    const prompt = `Bạn là một chuyên gia khởi nghiệp tại Việt Nam. Người dùng muốn khởi nghiệp dựa trên sở thích/thế mạnh là: "${aiKeyword}". 
    Hãy gợi ý 1 ý tưởng kinh doanh nhỏ, ít vốn (dưới 50 triệu) phù hợp.
    Trả về kết quả dưới dạng JSON với cấu trúc:
    {
      "ideaName": "Tên ý tưởng ngắn gọn, bắt tai",
      "concept": "Mô tả mô hình hoạt động trong 1 câu",
      "usp": "Điểm khác biệt để cạnh tranh",
      "firstStep": "Bước hành động đầu tiên ngay ngày mai"
    }
    Chỉ trả về JSON, không thêm text thừa.`;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json"
            }
          }),
        }
      );

      const data = await response.json();
      
      if (data.error) {
         throw new Error(data.error.message);
      }

      const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (generatedText) {
          const parsedResult = JSON.parse(generatedText);
          setAiResult(parsedResult);
      } else {
          setAiError("AI đang bận, vui lòng thử lại.");
      }

    } catch (error) {
      console.error("Gemini Error:", error);
      setAiError("Có lỗi kết nối, vui lòng thử lại.");
    } finally {
      setAiLoading(false);
    }
  };


  // --- SUCCESS SCREEN (SPA Routing) ---
  if (isSuccess) {
    return (
      <div className="min-h-screen bg-green-50 flex flex-col items-center justify-center p-6 text-center animate-fadeIn relative overflow-hidden">
        {/* Confetti Effect Background (Simple CSS shapes) */}
        <div className="absolute top-10 left-10 w-4 h-4 bg-yellow-400 rounded-full animate-bounce delay-100"></div>
        <div className="absolute top-20 right-20 w-3 h-3 bg-red-400 rotate-45 animate-ping delay-300"></div>
        <div className="absolute bottom-10 left-1/4 w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>

        <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-6 shadow-xl shadow-green-200 animate-[bounce_1s_ease-in-out_1]">
          <CheckCircle className="w-12 h-12 text-green-600" />
        </div>
        
        <h2 className="text-3xl font-bold mb-2 text-green-800">
          Tuyệt vời! Bạn đã đăng ký thành công
        </h2>
        <p className="text-gray-600 mb-8 max-w-md">
          Dữ liệu đã được lưu. Dưới đây là bộ tài liệu <span className="font-bold">"20 ý tưởng khởi nghiệp"</span> dành riêng cho bạn.
        </p>

        {/* --- MAIN ACTION: OPEN SHEET WITH TRACKING --- */}
        <button 
            onClick={handleOpenSheet}
            disabled={isTrackingClick}
            className="group relative inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-green-600 to-green-500 text-white font-bold text-lg rounded-2xl shadow-xl shadow-green-500/40 hover:shadow-green-500/60 hover:-translate-y-1 transition-all duration-300 mb-6 disabled:opacity-70"
        >
            <span className="absolute inset-0 w-full h-full bg-white/20 group-hover:bg-transparent transition-all rounded-2xl"></span>
            {isTrackingClick ? (
                <span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></span>
            ) : (
                <BookOpen className="w-6 h-6 animate-pulse" />
            )}
            <span>Mở Google Sheet Ngay</span>
            <ExternalLink className="w-5 h-5 opacity-70 group-hover:translate-x-1 transition-transform" />
        </button>
        
        <button 
          onClick={() => { setIsSuccess(false); setFormData({...formData, contactValue: '', location: '', age: '', stage: '', topic: '', otherTopic: '', otherLocation: ''}); setLeadId(null); }}
          className="px-6 py-2 bg-white border border-gray-200 rounded-full text-gray-500 hover:bg-gray-50 hover:text-green-700 transition-colors font-medium text-sm"
        >
          Quay lại trang chủ
        </button>
      </div>
    );
  }

  // --- MAIN UI ---
  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans selection:bg-green-100 selection:text-green-900">
      
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-green-50 rounded-full blur-[120px] opacity-60 translate-x-1/3 -translate-y-1/4"></div>
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-50 rounded-full blur-[100px] opacity-60 -translate-x-1/4 translate-y-1/4"></div>
      </div>

      <div className="relative z-10 max-w-md mx-auto md:max-w-2xl lg:max-w-5xl px-5 py-6 flex flex-col min-h-screen">
        
        {/* HEADER */}
        <header className="flex justify-between items-center mb-10 sticky top-0 bg-white/80 backdrop-blur-md py-4 -mx-5 px-5 z-20 transition-all">
          <div className="flex items-center gap-3">
            <LogoBrick />
            <div className="flex flex-col">
              <span className="font-bold text-xl tracking-tight text-gray-900">THỢ KHỞI NGHIỆP</span>
              <span className="text-[10px] text-gray-500 font-medium uppercase tracking-widest">Xây dựng tương lai</span>
            </div>
          </div>
          <a href="#register-form" className="hidden md:block bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-all shadow-lg shadow-green-600/20">
            Nhận Tài Liệu
          </a>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* LEFT CONTENT (Hero + AI Tool) */}
          <div className="lg:col-span-7 flex flex-col pt-4 lg:pt-0">
            
            {/* Hero Text */}
            <div className="text-center lg:text-left">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-green-50 border border-green-100 text-xs font-semibold text-green-700 mb-6 mx-auto lg:mx-0 w-fit">
                <Users className="w-3 h-3" />
                Cộng đồng 20,000+ thành viên
                </div>
                
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-[1.15] text-gray-900 mb-6 tracking-tight">
                Xây Dựng <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-green-400">Cơ Nghiệp</span> <br className="hidden md:block" />
                Từ Những Viên Gạch Nhỏ
                </h1>
                
                <p className="text-gray-600 text-lg leading-relaxed mb-8 max-w-xl mx-auto lg:mx-0">
                Bạn có ý tưởng nhưng chưa biết bắt đầu từ đâu? Nhận ngay bộ công cụ <strong>"Khởi nghiệp dưới 50 triệu"</strong> để biến ý tưởng thành hiện thực, từng bước một.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-gray-50 border border-gray-100 hover:shadow-md transition-shadow">
                        <div className="p-2 bg-white rounded-lg shadow-sm text-green-600">
                        <ShieldCheck size={20} />
                        </div>
                        <div className="text-left">
                        <h3 className="font-bold text-gray-900 text-sm">Thực tế & An toàn</h3>
                        <p className="text-xs text-gray-500 mt-1">Các mô hình đã được kiểm chứng rủi ro thấp.</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-gray-50 border border-gray-100 hover:shadow-md transition-shadow">
                        <div className="p-2 bg-white rounded-lg shadow-sm text-green-600">
                        <TrendingUp size={20} />
                        </div>
                        <div className="text-left">
                        <h3 className="font-bold text-gray-900 text-sm">Lộ trình tăng trưởng</h3>
                        <p className="text-xs text-gray-500 mt-1">Từ 0 đến có lợi nhuận trong 30 ngày.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- AI FEATURE SECTION --- */}
            <div className="mt-4 mb-12 p-1 rounded-2xl bg-gradient-to-r from-green-200 via-emerald-200 to-teal-200 shadow-xl">
                <div className="bg-white rounded-xl p-5 md:p-6">
                    <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="w-5 h-5 text-yellow-500 fill-yellow-500 animate-pulse" />
                        <h3 className="font-bold text-gray-900">Góc Sáng Tạo AI (Beta)</h3>
                    </div>
                    <p className="text-sm text-gray-500 mb-4">
                        Nhập sở thích hoặc thế mạnh của bạn, AI sẽ gợi ý ngay một ý tưởng kinh doanh ít vốn.
                    </p>

                    <div className="flex gap-2 mb-4">
                        <input 
                            type="text" 
                            placeholder="Ví dụ: Nấu ăn, Thích mèo, Giỏi vẽ..." 
                            className="flex-1 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                            value={aiKeyword}
                            onChange={(e) => setAiKeyword(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && generateStartupIdea()}
                        />
                        <button 
                            onClick={generateStartupIdea}
                            disabled={aiLoading || !aiKeyword.trim()}
                            className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2 transition-all"
                        >
                            {aiLoading ? (
                                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                            ) : (
                                <Zap size={16} />
                            )}
                            <span className="hidden sm:inline">Tạo Idea</span>
                        </button>
                    </div>

                    {aiError && (
                         <div className="text-red-500 text-xs bg-red-50 p-2 rounded mb-2">{aiError}</div>
                    )}

                    {aiResult && (
                        <div className="bg-green-50/50 border border-green-100 rounded-lg p-4 animate-fadeIn">
                            <h4 className="font-bold text-green-800 text-lg mb-2 flex items-center gap-2">
                                <Lightbulb size={18} /> {aiResult.ideaName}
                            </h4>
                            <ul className="space-y-2 text-sm">
                                <li className="flex gap-2">
                                    <span className="font-bold text-gray-700 min-w-[80px]">Mô hình:</span>
                                    <span className="text-gray-600">{aiResult.concept}</span>
                                </li>
                                <li className="flex gap-2">
                                    <span className="font-bold text-gray-700 min-w-[80px]">Khác biệt:</span>
                                    <span className="text-gray-600">{aiResult.usp}</span>
                                </li>
                                <li className="flex gap-2">
                                    <span className="font-bold text-gray-700 min-w-[80px]">Bắt đầu:</span>
                                    <span className="text-gray-600 italic">{aiResult.firstStep}</span>
                                </li>
                            </ul>
                            <div className="mt-3 text-xs text-center text-gray-400 border-t border-green-200 pt-2">
                                Bạn thích ý tưởng này? Đăng ký bên phải để nhận bản kế hoạch chi tiết! 👉
                            </div>
                        </div>
                    )}
                </div>
            </div>

          </div>

          {/* RIGHT CONTENT (Form) */}
          <div id="register-form" className="lg:col-span-5">
            <div className="bg-white border border-gray-100 rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] p-6 md:p-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-400 to-green-600"></div>
              
              <h3 className="text-xl font-bold text-gray-900 mb-1">Đăng ký nhận tài liệu</h3>
              <p className="text-sm text-gray-500 mb-6">Điền thông tin để chúng tôi gửi tài liệu phù hợp nhất.</p>

              <form onSubmit={handleSubmit} className="space-y-5">
                
                {/* 1. Kênh nhận tài liệu */}
                <div>
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2 block">1. Nhận qua kênh nào?</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setContactMethod('email')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-all ${contactMethod === 'email' ? 'bg-green-50 border-green-500 text-green-700 shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                    >
                      <Mail size={16} /> Email
                    </button>
                    <button
                      type="button"
                      onClick={() => setContactMethod('zalo')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-all ${contactMethod === 'zalo' ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                    >
                      <Smartphone size={16} /> Zalo
                    </button>
                  </div>
                </div>

                {/* 2. Input Email/SDT */}
                <div>
                  <input
                    type={contactMethod === 'email' ? 'email' : 'tel'}
                    name="contactValue"
                    required
                    placeholder={contactMethod === 'email' ? 'Nhập địa chỉ Email của bạn' : 'Nhập số Zalo của bạn'}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-200 transition-all text-sm"
                    value={formData.contactValue}
                    onChange={handleChange}
                  />
                </div>

                {/* 3. Địa điểm & Độ tuổi (2 cột) */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Bạn ở đâu?</label>
                    <select
                      name="location"
                      required
                      className={`w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500 ${formData.location ? 'text-gray-700' : 'text-gray-400'}`}
                      value={formData.location}
                      onChange={handleChange}
                    >
                      <option value="" disabled>-- Chọn --</option>
                      <option value="Hà Nội">Hà Nội</option>
                      <option value="HCM">TP. HCM</option>
                      <option value="Đà Nẵng">Đà Nẵng</option>
                      <option value="Hải Phòng">Hải Phòng</option>
                      <option value="Khác">Khác</option>
                    </select>
                    {formData.location === 'Khác' && (
                      <input
                        type="text"
                        name="otherLocation"
                        placeholder="Nhập nơi bạn ở..."
                        className="mt-1 w-full text-sm border border-gray-200 bg-gray-50 rounded-lg focus:border-green-500 focus:outline-none py-2 px-3"
                        value={formData.otherLocation}
                        onChange={handleChange}
                        required
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Độ tuổi</label>
                    <select
                      name="age"
                      required
                      className={`w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500 ${formData.age ? 'text-gray-700' : 'text-gray-400'}`}
                      value={formData.age}
                      onChange={handleChange}
                    >
                      <option value="" disabled>-- Chọn --</option>
                      <option value="<18">&lt; 18 tuổi</option>
                      <option value="18-24">18 - 24 tuổi</option>
                      <option value="25-30">25 - 30 tuổi</option>
                      <option value="31-40">31 - 40 tuổi</option>
                      <option value="41+">Trên 41 tuổi</option>
                    </select>
                  </div>
                </div>

                {/* 4. Giai đoạn hiện tại */}
                <div>
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2 block">Giai đoạn hiện tại?</label>
                  <div className="space-y-2">
                    {[
                      { val: 'tham_khao', label: 'Chỉ xem cho vui / tham khảo' },
                      { val: 'muon_lam', label: 'Đang muốn làm thử để kiếm thêm' },
                      { val: 'da_ban', label: 'Đã bán nhỏ lẻ' },
                      { val: 'nghiem_tuc', label: 'Đang làm nghiêm túc' }
                    ].map((opt) => (
                      <label key={opt.val} className="flex items-center gap-3 p-2 rounded-lg border border-gray-100 cursor-pointer hover:bg-gray-50 has-[:checked]:border-green-500 has-[:checked]:bg-green-50 transition-all">
                        <input
                          type="radio"
                          name="stage"
                          value={opt.val}
                          checked={formData.stage === opt.val}
                          onChange={handleChange}
                          className="text-green-600 focus:ring-green-500 h-4 w-4"
                        />
                        <span className="text-sm text-gray-700">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 5. Chủ đề quan tâm */}
                <div>
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2 block">Chủ đề quan tâm nhất?</label>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { val: 'chon_y_tuong', label: 'Chọn ý tưởng phù hợp' },
                      { val: 'ban_thu_7_ngay', label: 'Bắt đầu bán thử trong 7 ngày' },
                      { val: 'marketing', label: 'Marketing / Content' },
                      { val: 'nguon_hang', label: 'Nguồn hàng / Sản phẩm' },
                      { val: 'von_chi_phi', label: 'Tính vốn / Chi phí' },
                      { val: 'khac', label: 'Khác' }
                    ].map((opt) => (
                      <label key={opt.val} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name="topic"
                          value={opt.val}
                          checked={formData.topic === opt.val}
                          onChange={handleChange}
                          className="text-green-600 focus:ring-green-500 h-4 w-4"
                        />
                        <span className="text-sm text-gray-600">{opt.label}</span>
                      </label>
                    ))}
                    {formData.topic === 'khac' && (
                      <input 
                        type="text" 
                        name="otherTopic"
                        placeholder="Ghi rõ chủ đề bạn cần..."
                        className="mt-1 w-full text-sm border-b border-gray-300 focus:border-green-500 focus:outline-none py-1 px-2"
                        value={formData.otherTopic}
                        onChange={handleChange}
                      />
                    )}
                  </div>
                </div>

                {/* ERROR MESSAGE */}
                {submitError && (
                    <div className="bg-red-50 text-red-500 text-xs p-3 rounded-lg mb-4 text-center">
                        {submitError}
                    </div>
                )}

                {/* SUBMIT BUTTON */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-green-600/30 transform active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 group mt-4 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></span>
                  ) : (
                    <>
                      GỬI TÀI LIỆU CHO TÔI
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
                
                <p className="text-[10px] text-center text-gray-400 mt-2">
                  Cam kết bảo mật thông tin. Tham gia để cùng nhau phát triển.
                </p>
              </form>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default LandingPage;

