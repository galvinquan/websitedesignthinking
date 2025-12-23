// app.js (module)
const ORS_API_KEY = (window.CONFIG && window.CONFIG.ORS_KEY) ? window.CONFIG.ORS_KEY : '';

// --------- Setup map ----------
const map = L.map('map').setView([21.0285, 105.8342], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

let startMarker = null, endMarker = null, routeLayer = null;

// --------- DOM ----------
const startInput = document.getElementById('start');
const endInput = document.getElementById('end');
const startSuggestions = document.getElementById('start-suggestions');
const endSuggestions = document.getElementById('end-suggestions');
const routeBtn = document.getElementById('routeBtn');
const weatherSummary = document.getElementById('weatherSummary');
const adviceArea = document.getElementById('adviceArea');

// --------- Helpers ----------
const debounce = (fn, wait=300) => { let t; return (...a)=>{ clearTimeout(t); t = setTimeout(()=>fn(...a), wait); }; };

// Hà Nội bounding box (west,south,east,north)
const HN_VIEWBOX = {
  west: 105.52,
  south: 20.80,
  east: 106.02,
  north: 21.40
};

// Build Nominatim URL constrained to Hanoi (viewbox + bounded)
function nominatimURL(q) {
  const base = 'https://nominatim.openstreetmap.org/search';
  const params = new URLSearchParams({
    format: 'json',
    q: q,
    addressdetails: '1',
    limit: '8',
    viewbox: `${HN_VIEWBOX.west},${HN_VIEWBOX.south},${HN_VIEWBOX.east},${HN_VIEWBOX.north}`,
    bounded: '1',
    'accept-language': 'vi'
  });
  return `${base}?${params.toString()}`;
}

// Create a nice marker with arrow for start/end
function makeArrowIcon(type='start') {
  const color = type === 'start' ? '#10b981' : '#ef4444';
  const arrowSvg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill="${color}" />
      <path d="M8 12l6-4v8z" fill="#fff"/>
    </svg>
  `);
  return L.divIcon({
    html: `<img src="data:image/svg+xml;utf8,${arrowSvg}" style="width:36px;height:36px;">`,
    className: '',
    iconSize: [36,36],
    iconAnchor: [18,18]
  });
}

// Place marker helpers
function placeStart(lat, lon) {
  if (startMarker) map.removeLayer(startMarker);
  startMarker = L.marker([parseFloat(lat), parseFloat(lon)], { icon: makeArrowIcon('start') }).addTo(map);
  startMarker.bindPopup('Start').openPopup();
}
function placeEnd(lat, lon) {
  if (endMarker) map.removeLayer(endMarker);
  endMarker = L.marker([parseFloat(lat), parseFloat(lon)], { icon: makeArrowIcon('end') }).addTo(map);
  endMarker.bindPopup('End').openPopup();
}

// --------- Autocomplete (Hanoi only) ----------
async function fetchSuggestions(q) {
  if (!q || q.trim().length < 2) return [];
  try {
    const res = await fetch(nominatimURL(q));
    const arr = await res.json();
    // Filter safe: ensure Hanoi appears in display_name or address
    return arr.filter(p => {
      const a = p.address || {};
      if (p.display_name && p.display_name.toLowerCase().includes('hà nội')) return true;
      if (a.city && a.city.toLowerCase().includes('hà nội')) return true;
      if (a.state && a.state.toLowerCase().includes('hà nội')) return true;
      return false;
    });
  } catch (e) {
    console.error('Nominatim error', e);
    return [];
  }
}

function renderSuggestions(list, boxEl, onSelect) {
  if (!list.length) { boxEl.style.display = 'none'; boxEl.innerHTML = ''; return; }
  boxEl.style.display = 'block';
  boxEl.innerHTML = list.map(item =>
    `<div class="suggestion-item" data-lat="${item.lat}" data-lon="${item.lon}">${item.display_name}</div>`
  ).join('');
  boxEl.querySelectorAll('.suggestion-item').forEach(el=>{
    el.addEventListener('click', ()=> {
      const lat = el.dataset.lat, lon = el.dataset.lon;
      onSelect(lat, lon, el.textContent);
      boxEl.style.display = 'none';
    });
  });
}

// Debounced input handlers
startInput.addEventListener('input', debounce(async (ev)=>{
  const q = ev.target.value;
  const list = await fetchSuggestions(q);
  renderSuggestions(list, startSuggestions, (lat,lon,text)=>{
    startInput.value = text;
    placeStart(lat, lon);
  });
}));

endInput.addEventListener('input', debounce(async (ev)=>{
  const q = ev.target.value;
  const list = await fetchSuggestions(q);
  renderSuggestions(list, endSuggestions, (lat,lon,text)=>{
    endInput.value = text;
    placeEnd(lat, lon);
  });
}));

// Close suggestions if click outside
document.addEventListener('click', e=>{
  if (!e.target.closest('.input-group') && e.target !== startInput) startSuggestions.style.display='none';
  if (!e.target.closest('.input-group') && e.target !== endInput) endSuggestions.style.display='none';
});

// --------- Routing (OpenRouteService) ----------
async function computeRoute() {
  if (!startMarker || !endMarker) {
    alert('Vui lòng chọn điểm bắt đầu & điểm đến từ gợi ý trong Hà Nội');
    return;
  }

  const s = startMarker.getLatLng();
  const e = endMarker.getLatLng();

  const url = `https://api.openrouteservice.org/v2/directions/driving-car/geojson`;

  routeBtn.disabled = true;
  routeBtn.textContent = 'Đang tìm đường...';

  try {
    if (!ORS_API_KEY) {
      alert('ORS API key not configured. Please add ORS key to config.js or app.js');
      return;
    }
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": ORS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        coordinates: [
          [s.lng, s.lat],
          [e.lng, e.lat]
        ]
      })
    });

    const data = await res.json();
    if (!data.features || !data.features.length) throw new Error("No route");

    const coords = data.features[0].geometry.coordinates.map(c => [c[1], c[0]]);

    if (routeLayer) map.removeLayer(routeLayer);
    routeLayer = L.polyline(coords, { weight:5 }).addTo(map);
    map.fitBounds(routeLayer.getBounds(), { padding: [40,40] });

    await showWeatherAt(e.lat, e.lng);

  } catch (err) {
    console.error("ORS Error:", err);
    alert("Không thể tính tuyến. Kiểm tra API key ORS hoặc quota.");
  } finally {
    routeBtn.disabled = false;
    routeBtn.textContent = "🚗 Tìm đường tối ưu";
  }
}

routeBtn.addEventListener('click', computeRoute);

// --------- Weather + Air (Open-Meteo + WAQI) ----------

// Hàm phụ trách lấy PM2.5 và đưa ra Lời Khuyên (cần WAQI Token)
async function getPM25AndAdvice(lat, lon, temp, rain) {
  try {
      const token = (window.CONFIG && window.CONFIG.WAQI_KEY) ? window.CONFIG.WAQI_KEY : '';
      if (!token) {
        console.warn('WAQI token not configured (WAQI_KEY). Skipping PM2.5.');
        document.getElementById("pm25").textContent = "N/A";
        document.getElementById("advice").textContent = "Không có token WAQI, không thể cập nhật PM2.5";
        return;
      }
      const url = `https://api.waqi.info/feed/geo:${lat};${lon}/?token=${token}`;
    const res = await fetch(url);
    const data = await res.json();

    const pm25 = data?.data?.iaqi?.pm25?.v ?? "N/A";
    document.getElementById("pm25").textContent = pm25;

    // ✅ Logic gợi ý
    let advice = "";

    if (temp !== "N/A" && temp < 18) advice += "🌬️ Trời lạnh lắm đấy, con vợ nhớ mặc ấm nhé 😘";
    if (temp !== "N/A" && temp > 30) advice += " Hôm nay trời nắng nóng đấy, con vợ nhớ uống đủ nước và giữ sức khỏe";
    if (rain !== "N/A" && rain > 50) advice += "🌧️ Con vợ nhớ mang áo mưa đi, anh không muốn thấy con vợ anh ướt át đâu ";
    if (pm25 !== "N/A" && pm25 > 80) advice += "😷 Không khí xấu lắm đấy, con vợ hãy đeo khẩu trang vào nhé 😘 ";
    if (!advice) advice = "✅ Thời tiết tốt, đi lại thoải mái!";

    document.getElementById("advice").textContent = advice;

  } catch (e) {
    console.error("AQI error:", e);
    document.getElementById("pm25").textContent = "N/A";
    document.getElementById("advice").textContent = "Không thể lấy dữ liệu môi trường";
  }
}



// Hàm chính lấy Thời tiết (Open-Meteo) và gọi hàm AQI
async function showWeatherAt(lat, lon) {
  let temp = "N/A";
  let rain = "N/A";

  try {
    // Gọi API mới của Open-Meteo
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation&hourly=precipitation_probability&timezone=Asia%2FBangkok`;

    const res = await fetch(url);
    const data = await res.json();

    // --- Lấy nhiệt độ hiện tại ---
    temp = data?.current?.temperature_2m ?? "N/A";

    // --- Lấy khả năng mưa ---
    // Nếu current không có, lấy giá trị từ hourly (phần tử đầu tiên)
    if (data?.current?.precipitation_probability !== undefined) {
      rain = data.current.precipitation_probability;
    } else if (Array.isArray(data?.hourly?.precipitation_probability) && data.hourly.precipitation_probability.length > 0) {
      rain = data.hourly.precipitation_probability[0];
    } else if (data?.current?.precipitation !== undefined) {
      // fallback: lượng mưa hiện tại (mm)
      rain = (data.current.precipitation * 100).toFixed(0); // tạm quy đổi 0–1mm -> %
    }

    // --- Hiển thị ---
    document.getElementById("temp").textContent =
      temp !== "N/A" ? `${temp.toFixed(1)}°C` : "N/A";

    document.getElementById("rain").textContent =
      rain !== "N/A" ? `${rain}%` : "N/A";

  } catch (err) {
    console.error("Weather error:", err);
    document.getElementById("temp").textContent = "N/A";
    document.getElementById("rain").textContent = "N/A";
  }

  // Sau khi có dữ liệu thời tiết -> gọi hàm chất lượng không khí
  await getPM25AndAdvice(lat, lon, temp, rain);
}

// ==========================
// 🤖 CHATBOT (OpenAI API)
// ==========================

// OpenAI key is now proxied by the local server at /api/chat to avoid leaking keys in the frontend.
const CHAT_MODEL = "gpt-4o-mini";

// Chờ DOM load xong mới gắn sự kiện
document.addEventListener("DOMContentLoaded", () => {
  const chatbox = document.getElementById("chatbox");
  const userInput = document.getElementById("userInput");
  const sendBtn = document.getElementById("sendBtn");

  if (!chatbox || !userInput || !sendBtn) {
    console.warn("❌ Chatbot chưa được nhúng vào HTML.");
    return;
  }

  sendBtn.addEventListener("click", sendMessage);
  userInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  async function sendMessage() {
    const message = userInput.value.trim();
    if (!message) return;

    appendMessage("Bạn", message, "#1d4ed8");
    userInput.value = "";

    try {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Đang gửi...';
      // Send to our local proxy endpoint which securely holds the OpenAI API key
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      const data = await res.json();
      const reply = data?.reply || 'Đang load... Chúng tôi chưa có thông tin :(';
      appendMessage("Trợ lý", reply, "#16a34a");
    } catch (err) {
      appendMessage("Trợ lý", "❌ Lỗi kết nối API, vui lòng thử lại.", "red");
      console.error("Chatbot error:", err);
    }
    finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Gửi';
    }
  }

  function appendMessage(sender, text, color) {
    const div = document.createElement("div");
    div.style.margin = "6px 0";
    div.innerHTML = `<b>${sender}:</b> ${text}`;
    div.style.color = color;
    chatbox.appendChild(div);
    chatbox.scrollTop = chatbox.scrollHeight;
  }
});




// expose a couple for console testing
window._debug = { map, placeStart, placeEnd: placeEnd, showWeatherAt };

toggleBtn.onclick = () => {
  sidebar.classList.toggle('collapsed');

  // 🔥 BẮT BUỘC cho Leaflet
  setTimeout(() => {
    map.invalidateSize();
  }, 360); // khớp animation CSS
};
