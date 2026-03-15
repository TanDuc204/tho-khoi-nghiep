import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css' // Đảm bảo bạn đang import đúng file CSS chứa Tailwind

// Import các trang của bạn
// LƯU Ý: Chỉnh sửa lại đường dẫn import nếu bạn để file ở vị trí khác
import HomePage from './App.jsx' // Nếu bạn chưa đổi tên file App.jsx
import AdminDashboard from './AdminDashboard.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* URL mặc định dành cho khách hàng */}
        <Route path="/" element={<HomePage />} />
        
        {/* URL bí mật dành cho Admin */}
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)