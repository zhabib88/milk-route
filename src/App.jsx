import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Milk, 
  Truck, 
  Users, 
  Plus, 
  CheckCircle, 
  MapPin, 
  Phone, 
  Trash2, 
  BarChart3, 
  RefreshCw,
  LogOut,
  Building2,
  Pencil,
  Copy,
  CalendarDays,
  Loader2,
  MoreHorizontal,
  Calendar,
  XCircle,
  ArrowRight,
  RotateCcw,
  AlertTriangle,
  Download,
  Upload,
  AlertOctagon,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Search,
  FileSpreadsheet
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  onSnapshot, 
  serverTimestamp,
  writeBatch,
  where,
  getDocs,
  setDoc
} from 'firebase/firestore';

// ==========================================================================================
// [ACTION REQUIRED FOR VERCEL DEPLOYMENT]
// 1. Run 'npm install xlsx' in your local terminal
// 2. UNCOMMENT the import below:
 import * as XLSX from 'xlsx';
// ==========================================================================================

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyAzpP1ulElPjKq9EjzmQE34drWsMcRWKbQ",
  authDomain: "moghal-milk-app.firebaseapp.com",
  projectId: "moghal-milk-app",
  storageBucket: "moghal-milk-app.firebasestorage.app",
  messagingSenderId: "319508542388",
  appId: "1:319508542388:web:f25c556e3c5ce65e04f8e1",
  measurementId: "G-KHHZTFV4G5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'milk-route-default';

// --- UTILITY FUNCTIONS ---
const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const getTodayString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getCurrentMonthString = () => getTodayString().slice(0, 7); // YYYY-MM

const getTomorrowString = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getPreviousMonthString = (currentMonthStr) => {
  let [year, month] = currentMonthStr.split('-').map(Number);
  month -= 1;
  if (month === 0) {
    month = 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
};

const getFormattedDate = (dateString) => {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
};

const getDayNameFromDateString = (dateString) => {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return DAYS_OF_WEEK[date.getDay()];
};

const getQtyForDay = (customer, dayName) => {
  if (customer.schedule && !Array.isArray(customer.schedule) && typeof customer.schedule === 'object') {
    return customer.schedule[dayName] || 0;
  }
  if (customer.schedule && Array.isArray(customer.schedule) && customer.schedule.includes(dayName)) {
    return customer.defaultQty || 0;
  }
  return 0;
};

// --- DATA CALCULATION HELPERS ---

const getCustomerExceptions = (customer, monthStr, deliveries) => {
  if (!customer.schedule || !monthStr) return [];
  const exceptions = [];
  const [year, month] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    
    const dayName = DAYS_OF_WEEK[date.getDay()];
    const plannedQty = getQtyForDay(customer, dayName);

    if (plannedQty > 0) {
      const delivery = deliveries.find(del => del.customerId === customer.id && del.date === dateStr && !del.isRescheduled);
      if (delivery && delivery.status === 'skipped') {
        exceptions.push({
          date: dateStr,
          type: 'skipped',
          desc: delivery.note ? `${delivery.note}` : 'Skipped'
        });
      }
    }
  }

  const extras = deliveries.filter(d => 
    d.customerId === customer.id && 
    d.date.startsWith(monthStr) && 
    d.isRescheduled && 
    d.status !== 'skipped' 
  );

  extras.forEach(extra => {
    exceptions.push({
      date: extra.date,
      type: 'extra',
      desc: `Extra Delivery (${extra.qty}L)` + (extra.originalDate ? ` from ${extra.originalDate}` : '')
    });
  });

  return exceptions.sort((a, b) => a.date.localeCompare(b.date));
};

const calculateMonthlyPotential = (customer, monthStr, deliveries) => {
  if (!customer.schedule || !monthStr) return { total: 0, standard: 0, extra: 0 };
  
  const [year, month] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate(); 
  
  let total = 0;
  const effectiveStartDate = customer.startDate ? customer.startDate : `${year}-${String(month).padStart(2, '0')}-01`;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (dateStr >= effectiveStartDate) {
      const date = new Date(year, month - 1, d);
      const dayName = DAYS_OF_WEEK[date.getDay()];
      total += getQtyForDay(customer, dayName);
    }
  }

  const extraItems = deliveries.filter(d => 
    d.customerId === customer.id && 
    d.date.startsWith(monthStr) && 
    d.isRescheduled && 
    d.status !== 'skipped' 
  );
  const extraTotal = extraItems.reduce((sum, d) => sum + d.qty, 0);

  return { total: total + extraTotal, standard: total, extra: extraTotal };
};

const calculateRemainingPotential = (customer, monthStr, deliveries) => {
  if (!customer.schedule || !monthStr) return 0;
  const currentMonthStr = getCurrentMonthString();
  const potential = calculateMonthlyPotential(customer, monthStr, deliveries).total;

  if (monthStr < currentMonthStr) return 0;
  if (monthStr > currentMonthStr) return potential;

  const [year, month] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayDate = new Date().getDate(); 
  const effectiveStartDate = customer.startDate ? customer.startDate : `${year}-${String(month).padStart(2, '0')}-01`;

  let remaining = 0;

  for (let d = todayDate; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    
    if (dateStr >= effectiveStartDate) {
        const dayName = getDayNameFromDateString(dateStr);
        const dailyQty = getQtyForDay(customer, dayName);

        if (dailyQty > 0) {
        const existingStatus = deliveries.find(del => 
            del.customerId === customer.id && 
            del.date === dateStr &&
            !del.isRescheduled 
        )?.status;

        if (existingStatus !== 'delivered' && existingStatus !== 'skipped') {
            remaining += dailyQty;
        }
        }
    }
  }

  const futureExtras = deliveries.filter(d => 
    d.customerId === customer.id && 
    d.date.startsWith(monthStr) && 
    d.isRescheduled && 
    d.date >= getTodayString() && 
    d.status !== 'delivered' && 
    d.status !== 'skipped'
  );
  
  remaining += futureExtras.reduce((sum, d) => sum + d.qty, 0);

  return remaining;
};

// --- COMPONENTS ---

const Loading = ({ message = "Loading..." }) => (
  <div className="flex flex-col items-center justify-center h-screen bg-blue-50 text-blue-600">
    <RefreshCw className="w-12 h-12 animate-spin mb-4" />
    <h1 className="text-xl font-bold font-sans">Milk Route</h1>
    <p className="text-sm text-blue-400">{message}</p>
  </div>
);

// 0. Auth Error View
const AuthErrorView = ({ error }) => {
  const isConfigError = error.code === 'auth/configuration-not-found' || error.code === 'auth/operation-not-allowed';
  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-red-50 p-6 text-center">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldAlert className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Setup Required</h2>
        
        {isConfigError ? (
          <div className="text-left bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm space-y-3 mb-6">
            <p className="font-semibold text-gray-700">Please enable Authentication in Firebase:</p>
            <ol className="list-decimal pl-4 space-y-2 text-gray-600">
              <li>Go to <strong>Firebase Console</strong> &gt; <strong>Build</strong> &gt; <strong>Authentication</strong>.</li>
              <li>Click <strong>Get Started</strong>.</li>
              <li>Select the <strong>Sign-in method</strong> tab.</li>
              <li>Click <strong>Anonymous</strong>.</li>
              <li>Toggle <strong>Enable</strong> and click <strong>Save</strong>.</li>
            </ol>
          </div>
        ) : (
          <p className="text-red-600 mb-4 bg-red-50 p-3 rounded border border-red-100">{error.message}</p>
        )}

        <button 
          onClick={() => window.location.reload()}
          className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> I've Done It, Reload App
        </button>
      </div>
    </div>
  );
};

// 1. Delete Confirmation Modal
const DeleteConfirmModal = ({ customer, onClose, onConfirm }) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in">
    <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <AlertOctagon className="w-8 h-8 text-red-600" />
      </div>
      <h3 className="font-bold text-lg text-gray-800 mb-2">Delete Customer?</h3>
      <p className="text-sm text-gray-500 mb-6">
        This will delete <strong>{customer.name}</strong> and all their <strong>history & scheduled deliveries</strong>. This cannot be undone.
      </p>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200">
          Cancel
        </button>
        <button onClick={() => onConfirm(customer.id)} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl shadow-lg hover:bg-red-700">
          Yes, Delete All
        </button>
      </div>
    </div>
  </div>
);

// 2. Delivery Action Modal
const ActionModal = ({ delivery, onClose, onUpdateStatus, onReschedule }) => {
  const [rescheduleDate, setRescheduleDate] = useState(getTomorrowString());
  const [mode, setMode] = useState('menu'); 

  if (mode === 'reschedule') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in">
        <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" /> Reschedule Delivery
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            Moving {delivery.qty}L for {delivery.customerName} to:
          </p>
          <input 
            type="date" 
            className="w-full p-3 border border-gray-300 rounded-lg mb-4 font-medium"
            min={getTodayString()}
            value={rescheduleDate}
            onChange={(e) => setRescheduleDate(e.target.value)}
          />
          <div className="flex gap-3">
            <button onClick={() => setMode('menu')} className="flex-1 py-3 text-gray-600 font-medium">Back</button>
            <button onClick={() => onReschedule(delivery, rescheduleDate)} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-lg shadow-lg">Confirm</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
        <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
          <span className="font-bold text-gray-700">Options for {delivery.customerName}</span>
          <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-400" /></button>
        </div>
        <div className="p-4 space-y-3">
          {delivery.status !== 'skipped' ? (
            <button 
              onClick={() => onUpdateStatus(delivery, 'skipped')}
              className="w-full py-4 bg-red-50 text-red-600 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-red-100 transition-colors"
            >
              <XCircle className="w-5 h-5" /> Skip Delivery (Cancel)
            </button>
          ) : (
            <button 
              onClick={() => onUpdateStatus(delivery, 'pending')}
              className="w-full py-4 bg-green-50 text-green-700 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-green-100 transition-colors"
            >
              <RotateCcw className="w-5 h-5" /> Restore to Pending
            </button>
          )}
          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-gray-200"></div>
            <span className="flex-shrink-0 mx-4 text-gray-400 text-xs uppercase font-bold">Or Move To</span>
            <div className="flex-grow border-t border-gray-200"></div>
          </div>
          <button onClick={() => onReschedule(delivery, getTomorrowString())} className="w-full py-3 bg-blue-50 text-blue-700 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-blue-100">
            <ArrowRight className="w-5 h-5" /> Deliver Tomorrow
          </button>
          <button onClick={() => setMode('reschedule')} className="w-full py-3 border border-gray-200 text-gray-600 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-gray-50">
            <Calendar className="w-5 h-5" /> Pick Another Date
          </button>
        </div>
      </div>
    </div>
  );
};

// 3. Store Login Screen
const StoreLogin = ({ onJoin }) => {
  const [storeCode, setStoreCode] = useState('');
  const handleJoin = (e) => {
    e.preventDefault();
    if (storeCode.length < 3) return; 
    onJoin(storeCode.toLowerCase().replace(/\s+/g, '-'));
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="flex justify-center mb-6"><div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center"><Milk className="w-10 h-10 text-blue-600" /></div><div><h1 className="text-lg font-extrabold tracking-tight leading-none">Milk Route</h1><p className="text-center text-gray-500 mt-2">Enter your Shop/Route Code to start.</p></div></div>
        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Shop Code / Route Name</label>
            <input type="text" autoFocus placeholder="e.g. route-1" className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl outline-none font-medium" value={storeCode} onChange={(e) => setStoreCode(e.target.value)} />
          </div>
          <button type="submit" className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 active:scale-95 transition-all">Enter App</button>
        </form>
      </div>
    </div>
  );
};

// 4. Customer Form Modal
const CustomerForm = ({ onClose, onSave, defaultMonth, initialData = null }) => {
  const [name, setName] = useState(initialData?.name || '');
  const [phone, setPhone] = useState(initialData?.phone || '');
  const [address, setAddress] = useState(initialData?.address || '');
  const [targetMonth, setTargetMonth] = useState(initialData?.targetMonth || defaultMonth || getCurrentMonthString());
  const [startDate, setStartDate] = useState(() => {
    if (initialData?.startDate) return initialData.startDate;
    const today = getTodayString();
    const firstOfMonth = `${defaultMonth}-01`;
    return today.startsWith(defaultMonth) ? today : firstOfMonth; 
  });
  const [scheduleMap, setScheduleMap] = useState(() => {
    if (initialData?.schedule) {
      if (Array.isArray(initialData.schedule)) {
        const map = {};
        initialData.schedule.forEach(day => { map[day] = initialData.defaultQty || 1; });
        return map;
      } else { return initialData.schedule; }
    }
    return {}; 
  });

  const toggleDay = (day) => { const newMap = { ...scheduleMap }; if (newMap[day] !== undefined) { delete newMap[day]; } else { newMap[day] = 1; } setScheduleMap(newMap); };
  const updateDayQty = (day, qty) => { if (scheduleMap[day] !== undefined) { setScheduleMap({ ...scheduleMap, [day]: parseFloat(qty) }); } };
  const handleSubmit = (e) => { e.preventDefault(); if (!address.trim()) return; if (Object.keys(scheduleMap).length === 0) return; onSave({ id: initialData?.id, name, phone, address, schedule: scheduleMap, targetMonth, startDate }); onClose(); };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-blue-600 p-4 shrink-0 flex justify-between items-center"><h2 className="text-white font-bold text-lg flex items-center gap-2"><Users className="w-5 h-5" /> {initialData ? 'Edit Customer' : 'Add Customer'}</h2><button onClick={onClose} className="text-blue-100 hover:text-white"><LogOut className="w-5 h-5 rotate-180" /></button></div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-100"><label className="block text-xs font-bold text-blue-800 uppercase mb-1">Billing Month</label><input type="month" required className="w-full p-2 bg-white border border-blue-200 rounded text-blue-900 font-medium outline-none" value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} /></div>
          <div className="bg-green-50 p-3 rounded-lg border border-green-100">
            <label className="block text-xs font-bold text-green-800 uppercase mb-1 flex items-center gap-1"><CalendarDays className="w-3 h-3" /> Effective Start Date</label>
            <input type="date" required className="w-full p-2 bg-white border border-green-200 rounded text-green-900 font-medium outline-none" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <p className="text-[10px] text-green-700 mt-1">Milk counting starts from this date.</p>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label><input required type="text" className="w-full p-3 border border-gray-300 rounded-lg outline-none" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Address</label><textarea required className="w-full p-3 border border-gray-300 rounded-lg outline-none" rows="2" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Phone</label><input type="tel" className="w-full p-3 border border-gray-300 rounded-lg outline-none" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-2">Weekly Schedule</label>
            <div className="space-y-2 bg-gray-50 p-3 rounded-lg border border-gray-100">{DAYS_OF_WEEK.map(day => { const isSelected = scheduleMap[day] !== undefined; return (<div key={day} className="flex items-center gap-3"><button type="button" onClick={() => toggleDay(day)} className={`w-12 h-8 rounded text-xs font-bold transition-colors shrink-0 flex items-center justify-center ${isSelected ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-400'}`}>{day}</button>{isSelected ? (<div className="flex items-center flex-1"><input type="number" step="0.5" min="0.5" className="w-20 p-1.5 border border-blue-300 rounded text-center text-sm font-bold text-blue-700 outline-none" value={scheduleMap[day]} onChange={(e) => updateDayQty(day, e.target.value)} /><span className="ml-2 text-sm text-gray-600 font-medium">Litre</span></div>) : <div className="flex-1 h-8 border border-dashed border-gray-200 rounded bg-gray-50/50"></div>}</div>); })}</div>
          </div>
          <button type="submit" className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg shadow-lg hover:bg-blue-700 transition-all mt-4">{initialData ? 'Update Customer' : 'Save Customer'}</button>
        </form>
      </div>
    </div>
  );
};

// 5. Main App
export default function App() {
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [storeId, setStoreId] = useState(null);
  const [activeTab, setActiveTab] = useState('today');
  const [customers, setCustomers] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null); 
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [viewMonth, setViewMonth] = useState(getCurrentMonthString());
  const [todayViewDate, setTodayViewDate] = useState(getTodayString()); 
  
  // NEW: Daily Report Date State
  const [reportDailyDate, setReportDailyDate] = useState(getTodayString());

  const [isImporting, setIsImporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const savedStore = localStorage.getItem('milk_route_store_code');
        if (savedStore) setStoreId(savedStore);
        await signInAnonymously(auth); 
      } catch (err) {
        console.error("Auth Failed", err);
        setAuthError(err);
      }
    };
    initAuth();
    const unsub = onAuthStateChanged(auth, setUser, (err) => setAuthError(err));
    return unsub;
  }, []);

  useEffect(() => {
    if (!user || !storeId) return;
    const storePath = `stores/${storeId}`;
    const customersRef = collection(db, 'artifacts', appId, 'public', 'data', storePath, 'customers');
    const unsubCustomers = onSnapshot(query(customersRef), (snap) => setCustomers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    const deliveriesRef = collection(db, 'artifacts', appId, 'public', 'data', storePath, 'deliveries');
    const unsubDeliveries = onSnapshot(query(deliveriesRef), (snap) => setDeliveries(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    return () => { unsubCustomers(); unsubDeliveries(); };
  }, [user, storeId]);

  const handleStoreJoin = (code) => { setStoreId(code); localStorage.setItem('milk_route_store_code', code); };
  const handleLogout = () => { setStoreId(null); localStorage.removeItem('milk_route_store_code'); };

  const handleSaveCustomer = async (data) => {
    if (!storeId) return;
    const { id, ...dataToSave } = JSON.parse(JSON.stringify(data));
    
    try {
      const batch = writeBatch(db);
      const storePath = `stores/${storeId}`;
      
      if (id) {
        const custRef = doc(db, 'artifacts', appId, 'public', 'data', storePath, 'customers', id);
        batch.update(custRef, { ...dataToSave, updatedAt: serverTimestamp() });

        const todayStr = getTodayString();
        const pendingDeliveriesToSync = deliveries.filter(d => 
          d.customerId === id && 
          d.status === 'pending' && 
          d.date >= todayStr && 
          !d.isRescheduled 
        );

        pendingDeliveriesToSync.forEach(delivery => {
          const dayName = getDayNameFromDateString(delivery.date); 
          const tempCustomerObj = { schedule: dataToSave.schedule }; 
          const newQty = getQtyForDay(tempCustomerObj, dayName);
          
          const deliveryRef = doc(db, 'artifacts', appId, 'public', 'data', storePath, 'deliveries', delivery.id);

          const isDateValid = delivery.date >= dataToSave.startDate;

          if (newQty > 0 && isDateValid) {
            if (delivery.qty !== newQty) {
              batch.update(deliveryRef, { qty: newQty });
            }
          } else {
            batch.delete(deliveryRef);
          }
        });
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', storePath, 'customers'), { ...dataToSave, createdAt: serverTimestamp() });
        return; 
      }
      
      await batch.commit();
    } catch (e) { console.error(e); }
  };

  const confirmDeleteCustomer = async (id) => {
    if (!storeId) return;
    try {
      const batch = writeBatch(db);
      const storePath = `stores/${storeId}`;
      const custRef = doc(db, 'artifacts', appId, 'public', 'data', storePath, 'customers', id);
      batch.delete(custRef);
      const toDelete = deliveries.filter(d => d.customerId === id);
      toDelete.forEach(d => {
        const dRef = doc(db, 'artifacts', appId, 'public', 'data', storePath, 'deliveries', d.id);
        batch.delete(dRef);
      });
      await batch.commit();
      setDeleteCandidate(null);
    } catch(e) { console.error("Error deleting", e); }
  };

  const handleImportPreviousMonth = async () => {
    if (!storeId || previousMonthCustomers.length === 0) return;
    setIsImporting(true);
    try {
      const batch = writeBatch(db);
      const storePath = `stores/${storeId}`;
      const customersColl = collection(db, 'artifacts', appId, 'public', 'data', storePath, 'customers');
      
      const candidateDeliveries = deliveries.filter(d => d.date.startsWith(viewMonth) && d.isRescheduled === true);

      previousMonthCustomers.forEach(oldCustomer => {
        const newDocRef = doc(customersColl);
        const { id, createdAt, updatedAt, ...cleanData } = oldCustomer; 
        batch.set(newDocRef, { ...JSON.parse(JSON.stringify(cleanData)), targetMonth: viewMonth, importedFrom: oldCustomer.id, createdAt: serverTimestamp() });
        const orphans = candidateDeliveries.filter(d => d.customerId === oldCustomer.id);
        orphans.forEach(d => {
          const dRef = doc(db, 'artifacts', appId, 'public', 'data', storePath, 'deliveries', d.id);
          batch.update(dRef, { customerId: newDocRef.id, customerName: cleanData.name });
        });
      });
      await batch.commit();
      setTimeout(() => setIsImporting(false), 500);
    } catch (e) { console.error(e); setIsImporting(false); }
  };

  // --- 1. REAL EXCEL EXPORT (FOR VERCEL DEPLOYMENT) ---
  // UNCOMMENT THIS FUNCTION (AND DELETE THE ONE BELOW) WHEN PUSHING TO GITHUB
  
  const handleExportExcel = () => {
     const customersToExport = customers.filter(c => c.targetMonth === viewMonth);
     if (customersToExport.length === 0) {
       alert("No customers found for " + viewMonth);
       return;
     }
     
     if (typeof XLSX === 'undefined') {
       alert("Excel library not loaded. Please run 'npm install xlsx' locally.");
       return;
     }
  
     const wb = XLSX.utils.book_new();
     const [year, month] = viewMonth.split('-').map(Number);
     const daysInMonth = new Date(year, month, 0).getDate();
  
     // SUMMARY SHEET
     const summaryHeaders = ['Customer Name', 'Phone', 'Address', 'Total Planned', 'Total Delivered', 'Remaining'];
     const summaryRows = [];
     let grandTotalDelivered = 0;
     let grandTotalRemaining = 0;

     customersToExport.forEach(c => {
        const stats = calculateMonthlyPotential(c, viewMonth, deliveries);
        const remaining = calculateRemainingPotential(c, viewMonth, deliveries);
        const delivered = deliveredStats[c.id] || 0;
        grandTotalDelivered += delivered;
        grandTotalRemaining += remaining;
        summaryRows.push([c.name, c.phone || '-', c.address || '-', stats.total, delivered, remaining]);
     });
     summaryRows.push([]);
     summaryRows.push(['GRAND TOTAL', '', '', '', grandTotalDelivered, grandTotalRemaining]);
    
     const wsSummary = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryRows]);
     XLSX.utils.book_append_sheet(wb, wsSummary, "SUMMARY");
  
     // INDIVIDUAL SHEETS
     customersToExport.forEach(customer => {
       const wsData = [
         ['Customer Name:', customer.name],
         ['Phone:', customer.phone || '-'],
         ['Address:', customer.address || '-'],
         [],
         ['Date', 'Day', 'Quantity (L)', 'Status']
       ];
  
       const effectiveStartDate = customer.startDate ? customer.startDate : `${year}-${String(month).padStart(2, '0')}-01`;

       for (let d = 1; d <= daysInMonth; d++) {
         const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
         const dayName = getDayNameFromDateString(dateStr);
         
         const plannedQty = getQtyForDay(customer, dayName);
         const delivery = deliveries.find(del => del.customerId === customer.id && del.date === dateStr);
         
         let qtyDisplay = '-';
         let status = 'No Delivery';
         const isDateValid = dateStr >= effectiveStartDate;

         if ((plannedQty > 0 && isDateValid) || delivery) {
            qtyDisplay = (plannedQty > 0 && isDateValid) ? plannedQty : '-';
            status = 'Pending'; 
  
            if (delivery) {
              if (delivery.isRescheduled) {
                qtyDisplay = delivery.qty + ' (Rescheduled)';
                status = 'Extra';
              } else if (delivery.status === 'delivered') {
                status = 'Delivered';
              } else if (delivery.status === 'skipped') {
                status = 'Skipped';
                qtyDisplay = '0'; 
              }
            }
            wsData.push([dateStr, dayName, qtyDisplay, status]);
         } else {
             wsData.push([dateStr, dayName, qtyDisplay, status]);
         }
       }
  
       const ws = XLSX.utils.aoa_to_sheet(wsData);
       let sheetName = (customer.name || 'Customer').replace(/[\\/?*[\]]/g, "").substring(0, 30);
       let uniqueSheetName = sheetName;
       let counter = 1;
       while (wb.SheetNames.includes(uniqueSheetName)) {
         uniqueSheetName = `${sheetName.substring(0, 25)}_${counter}`;
         counter++;
       }
       XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName);
     });
  
     XLSX.writeFile(wb, `MilkRoute_Plan_${viewMonth}.xlsx`);
  };
  
  const handleExportData = () => {
    if (!storeId) return;
    const exportData = { store: storeId, exportedAt: new Date().toISOString(), customers: customers, deliveries: deliveries };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `milk-route-backup-${getTodayString()}.json`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleRestoreClick = () => { if (fileInputRef.current) fileInputRef.current.click(); };

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file || !storeId) return;
    setIsRestoring(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const batch = writeBatch(db);
        const storePath = `stores/${storeId}`;
        if (data.customers) data.customers.forEach(c => { const { id, ...cData } = c; batch.set(doc(db, 'artifacts', appId, 'public', 'data', storePath, 'customers', id), { ...cData, restoredAt: serverTimestamp() }, { merge: true }); });
        if (data.deliveries) data.deliveries.forEach(d => { const { id, ...dData } = d; batch.set(doc(db, 'artifacts', appId, 'public', 'data', storePath, 'deliveries', id), { ...dData, restoredAt: serverTimestamp() }, { merge: true }); });
        await batch.commit();
        alert("Data restored successfully!");
      } catch (error) { console.error("Restore failed:", error); alert("Failed to restore backup."); } finally { setIsRestoring(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
    };
    reader.readAsText(file);
  };

  const startDailyRoute = async () => {
    if (!storeId) return;
    const selectedDate = todayViewDate; // Use state
    const currentMonth = selectedDate.slice(0, 7); 
    const todayDayName = getDayNameFromDateString(selectedDate); // Use Safe Parser
    
    // Find customers active in the month of the SELECTED DATE
    const relevantCustomers = customers.filter(c => c.targetMonth === currentMonth && getQtyForDay(c, todayDayName) > 0);
    
    const existingRegularDeliveries = new Set(
      deliveries.filter(d => d.date === selectedDate && !d.isRescheduled).map(d => d.customerId)
    );
    
    const newDeliveries = relevantCustomers.filter(c => !existingRegularDeliveries.has(c.id));
    if (newDeliveries.length === 0) return;
    
    try {
      const batch = writeBatch(db);
      newDeliveries.forEach(customer => {
        if (customer.startDate && selectedDate < customer.startDate) return;

        const newDocRef = doc(collection(db, 'artifacts', appId, 'public', 'data', `stores/${storeId}`, 'deliveries'));
        batch.set(newDocRef, { 
          customerId: customer.id, 
          customerName: customer.name, 
          customerAddress: customer.address, 
          qty: getQtyForDay(customer, todayDayName), 
          date: selectedDate, 
          status: 'pending', 
          timestamp: serverTimestamp() 
        });
      });
      await batch.commit();
    } catch (e) { console.error(e); }
  };

  const toggleDeliveryStatus = async (delivery, specificStatus = null) => {
    const newStatus = specificStatus || (delivery.status === 'delivered' ? 'pending' : 'delivered');
    if (newStatus === 'pending' && delivery.status === 'skipped') {
      try {
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', `stores/${storeId}`, 'deliveries'), where("originalDeliveryId", "==", delivery.id));
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        const currentRef = doc(db, 'artifacts', appId, 'public', 'data', `stores/${storeId}`, 'deliveries', delivery.id);
        batch.update(currentRef, { status: 'pending', note: '' });
        snapshot.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        if(selectedDelivery) setSelectedDelivery(null);
        return; 
      } catch (e) { console.error(e); }
    }
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', `stores/${storeId}`, 'deliveries', delivery.id), { status: newStatus });
    if(selectedDelivery) setSelectedDelivery(null); 
  };

  const handleReschedule = async (delivery, newDate) => {
    if(!storeId) return;
    try {
      const batch = writeBatch(db);
      const storePath = `stores/${storeId}`;
      const currentRef = doc(db, 'artifacts', appId, 'public', 'data', storePath, 'deliveries', delivery.id);
      batch.update(currentRef, { status: 'skipped', note: `Rescheduled to ${newDate}` });
      const newRef = doc(collection(db, 'artifacts', appId, 'public', 'data', storePath, 'deliveries'));
      batch.set(newRef, { customerId: delivery.customerId, customerName: delivery.customerName, customerAddress: delivery.customerAddress, qty: delivery.qty, date: newDate, status: 'pending', isRescheduled: true, originalDeliveryId: delivery.id, originalDate: delivery.date, timestamp: serverTimestamp() });
      await batch.commit();
      setSelectedDelivery(null);
    } catch(e) { console.error(e); }
  };

  const currentViewDeliveries = useMemo(() => {
    const validCustomerIds = new Set(customers.map(c => c.id)); 
    return deliveries
      .filter(d => d.date === todayViewDate && validCustomerIds.has(d.customerId))
      .sort((a, b) => {
        const statusOrder = { 'pending': 0, 'delivered': 1, 'skipped': 2 };
        return statusOrder[a.status] - statusOrder[b.status];
      });
  }, [deliveries, todayViewDate, customers]);

  const visibleCustomers = useMemo(() => {
    return customers.filter(c => {
      const matchesMonth = c.targetMonth === viewMonth;
      const matchesSearch = searchTerm 
        ? c.name.toLowerCase().includes(searchTerm.toLowerCase()) 
        : true;
      return matchesMonth && matchesSearch;
    });
  }, [customers, viewMonth, searchTerm]);

  const previousMonthCustomers = useMemo(() => customers.filter(c => c.targetMonth === getPreviousMonthString(viewMonth)), [customers, viewMonth]);
  const reportData = useMemo(() => deliveries.filter(d => d.date.startsWith(viewMonth) && d.status === 'delivered').reduce((acc, curr) => {
    if (!acc[curr.customerId]) acc[curr.customerId] = { name: curr.customerName, totalQty: 0, deliveriesCount: 0 };
    acc[curr.customerId].totalQty += curr.qty; acc[curr.customerId].deliveriesCount += 1;
    return acc;
  }, {}), [deliveries, viewMonth]);
  const deliveredStats = useMemo(() => deliveries.filter(d => d.date.startsWith(viewMonth) && d.status === 'delivered').reduce((acc, curr) => {
    acc[curr.customerId] = (acc[curr.customerId] || 0) + curr.qty; return acc;
  }, {}), [deliveries, viewMonth]);

  const grandTotalDelivered = useMemo(() => {
    return Object.values(reportData).reduce((sum, curr) => sum + curr.totalQty, 0);
  }, [reportData]);

  // NEW: Grand Total Planned Calculation
  const grandTotalPlanned = useMemo(() => {
    return visibleCustomers.reduce((sum, customer) => {
      return sum + calculateMonthlyPotential(customer, viewMonth, deliveries).total;
    }, 0);
  }, [visibleCustomers, viewMonth, deliveries]);

  // NEW: Grand Total Progress %
  const grandTotalProgress = useMemo(() => {
    return grandTotalPlanned > 0 ? (grandTotalDelivered / grandTotalPlanned) * 100 : 0;
  }, [grandTotalDelivered, grandTotalPlanned]);


  const reportDayTotal = useMemo(() => {
      return deliveries
          .filter(d => d.date === reportDailyDate && d.status === 'delivered')
          .reduce((sum, curr) => sum + curr.qty, 0);
  }, [deliveries, reportDailyDate]);

  const dailyRunStats = useMemo(() => {
    const totalQty = currentViewDeliveries.reduce((sum, d) => sum + d.qty, 0);
    const deliveredQty = currentViewDeliveries
      .filter(d => d.status === 'delivered')
      .reduce((sum, d) => sum + d.qty, 0);
    
    const totalStops = currentViewDeliveries.length;
    const completedStops = currentViewDeliveries.filter(d => d.status === 'delivered').length;

    return { totalQty, deliveredQty, totalStops, completedStops };
  }, [currentViewDeliveries]);

  if (authError) return <AuthErrorView error={authError} />;
  if (!user) return <Loading message="Authenticating..." />;
  if (!storeId) return <StoreLogin onJoin={handleStoreJoin} />;

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans text-slate-800">
      <header className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm"><Milk className="w-5 h-5 text-white" /></div><div><h1 className="text-lg font-extrabold tracking-tight leading-none">Milk Route</h1><p className="text-[10px] text-blue-100 opacity-80 font-mono mt-0.5 uppercase tracking-wide">Shop: {storeId}</p></div></div>
          <button onClick={handleLogout} className="p-2 bg-white/10 rounded-full hover:bg-white/20"><LogOut className="w-4 h-4 text-white" /></button>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4">
        {activeTab === 'today' && (
          <div className="animate-in slide-in-from-right duration-300">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Run Sheet</h2>
                <div className="relative mt-1">
                  <input 
                    type="date" 
                    value={todayViewDate}
                    onChange={(e) => setTodayViewDate(e.target.value)}
                    className="bg-transparent font-medium text-slate-500 text-sm border-b border-gray-300 focus:border-blue-500 outline-none pb-0.5"
                  />
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-blue-600 leading-none">
                  {dailyRunStats.deliveredQty} <span className="text-lg text-gray-400 font-normal">/ {dailyRunStats.totalQty} L</span>
                </div>
                <div className="text-xs text-gray-400 font-medium mt-1">
                  {dailyRunStats.completedStops} / {dailyRunStats.totalStops} Stops
                </div>
              </div>
            </div>
            {currentViewDeliveries.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center space-y-4">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto"><Truck className="w-8 h-8 text-blue-500" /></div>
                <h3 className="text-lg font-semibold text-gray-800">Ready to start?</h3>
                <p className="text-gray-500 text-sm">Generate the delivery list for <strong>{getFormattedDate(todayViewDate)}</strong>.</p>
                <button onClick={startDailyRoute} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-blue-200 shadow-lg hover:bg-blue-700 active:scale-95 transition-all">Start Route for {getFormattedDate(todayViewDate)}</button>
              </div>
            ) : (
              <div className="space-y-3">
                 <button onClick={startDailyRoute} className="w-full py-2 bg-blue-50 text-blue-600 text-sm font-semibold rounded-lg hover:bg-blue-100 mb-4 border border-blue-100 flex items-center justify-center gap-2"><RefreshCw className="w-3 h-3" /> Refresh / Add Missing</button>
                {currentViewDeliveries.map(delivery => (
                  <div key={delivery.id} onClick={() => { if(delivery.status === 'skipped') setSelectedDelivery(delivery) }} className={`relative overflow-hidden bg-white rounded-xl shadow-sm border transition-all duration-200 ${delivery.status === 'delivered' ? 'border-green-200 bg-green-50/30' : delivery.status === 'skipped' ? 'border-gray-200 opacity-60 cursor-pointer' : 'border-gray-100'}`}>
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex-1 pr-2">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className={`font-bold text-lg ${delivery.status === 'delivered' ? 'text-green-800 line-through decoration-green-800/30' : 'text-slate-800'}`}>{delivery.customerName}</h3>
                          {delivery.isRescheduled && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200 font-bold">Extra</span>}
                        </div>
                        <div className="bg-amber-50 text-amber-900 px-2 py-1.5 rounded-md text-xs font-medium flex items-start gap-1.5 mb-2 border border-amber-100">
                          <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" /> <span className="leading-snug">{delivery.customerAddress}</span>
                        </div>
                        <div className="inline-flex items-center px-2 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-md"><Milk className="w-3 h-3 mr-1" /> {delivery.qty} Litre</div>
                      </div>
                      {delivery.status !== 'skipped' && (
                        <button onClick={() => toggleDeliveryStatus(delivery)} className={`w-14 h-14 shrink-0 rounded-full flex items-center justify-center shadow-md transition-all active:scale-90 ${delivery.status === 'delivered' ? 'bg-green-100 text-green-600' : 'bg-white border-2 border-blue-100 text-gray-300 hover:border-blue-500 hover:text-blue-500'}`}>
                          {delivery.status === 'delivered' ? <CheckCircle className="w-8 h-8" /> : <div className="w-6 h-6 rounded-full border-2 border-current" />}
                        </button>
                      )}
                    </div>
                    {delivery.status === 'pending' && (
                      <div className="bg-gray-50 px-4 py-2 flex justify-end border-t border-gray-100">
                        <button onClick={() => setSelectedDelivery(delivery)} className="text-xs text-blue-600 hover:text-blue-800 font-bold px-3 py-1 flex items-center gap-1 bg-blue-100 rounded-full">Action <MoreHorizontal className="w-3 h-3" /></button>
                      </div>
                    )}
                    {delivery.status === 'skipped' && (
                      <div className="bg-red-50 px-4 py-2 border-t border-red-100 text-xs text-red-500 font-medium text-center flex items-center justify-center gap-2">
                        {delivery.note || 'Skipped'} <span className="underline opacity-70">Tap to Undo</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CUSTOMERS TAB */}
        {activeTab === 'customers' && (
          <div className="animate-in slide-in-from-right duration-300 pb-20">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                Customers 
                <span className="text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">{visibleCustomers.length}</span>
                </h2>
                <button onClick={() => { setEditingCustomer(null); setShowCustomerModal(true); }} className="bg-blue-600 text-white p-2 rounded-full shadow-lg hover:bg-blue-700 active:scale-90 transition-transform"><Plus className="w-6 h-6" /></button></div>
            
            <div className="bg-white p-3 rounded-lg border border-gray-200 mb-4 shadow-sm flex flex-col gap-3">
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                <Search className="w-4 h-4 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Search customers..." 
                  className="bg-transparent w-full outline-none text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && <button onClick={() => setSearchTerm('')}><XCircle className="w-4 h-4 text-gray-400" /></button>}
              </div>
              <div className="flex justify-between items-center border-t border-gray-100 pt-2">
                <span className="text-xs font-bold text-gray-500 uppercase">Viewing List For:</span>
                <input type="month" value={viewMonth} onChange={(e) => setViewMonth(e.target.value)} className="bg-transparent font-medium text-slate-800 outline-none text-right" />
              </div>
            </div>

            {visibleCustomers.length === 0 && previousMonthCustomers.length > 0 && !searchTerm && (
              <div className="bg-blue-600 rounded-xl p-4 mb-4 text-white flex flex-col items-start gap-2 shadow-lg animate-in slide-in-from-top duration-300">
                <div className="flex items-center gap-2"><CalendarDays className="w-5 h-5 text-blue-200" /><p className="font-bold">New Month Setup</p></div>
                <p className="text-sm text-blue-100">Found {previousMonthCustomers.length} customers from last month. Import them?</p>
                <button onClick={handleImportPreviousMonth} disabled={isImporting} className="mt-2 bg-white text-blue-700 px-4 py-3 rounded-lg font-bold text-sm hover:bg-blue-50 w-full flex items-center justify-center gap-2 disabled:opacity-80 transition-all">{isImporting ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</> : <><Copy className="w-4 h-4" /> Import {previousMonthCustomers.length} Customers</>}</button>
              </div>
            )}
            <div className="space-y-3">
              {visibleCustomers.length === 0 ? <div className="text-center py-10 text-gray-400"><p>No customers found for {viewMonth}.</p></div> : visibleCustomers.map(customer => {
                  const delivered = deliveredStats[customer.id] || 0;
                  const monthlyPot = calculateMonthlyPotential(customer, viewMonth, deliveries);
                  const planned = monthlyPot.total;
                  const remaining = calculateRemainingPotential(customer, viewMonth, deliveries);
                  const percent = planned > 0 ? (delivered / planned) * 100 : 0;
                  const exceptions = getCustomerExceptions(customer, viewMonth, deliveries);
                  return (
                    <div key={customer.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col group">
                      <div className="flex justify-between items-start mb-2"><div className="flex-1"><h3 className="font-bold text-slate-800 text-lg">{customer.name}</h3><p className="text-sm text-slate-500 flex items-start gap-1 mt-1"><MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span className="line-clamp-2">{customer.address}</span></p></div><div className="flex gap-1 ml-2"><button onClick={() => { setEditingCustomer(customer); setShowCustomerModal(true); }} className="text-gray-400 hover:text-blue-500 p-2 rounded-full hover:bg-blue-50 transition-colors"><Pencil className="w-4 h-4" /></button><button onClick={() => setDeleteCandidate(customer)} className="text-gray-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" /></button></div></div>
                      <div className="bg-gray-50 rounded-lg p-3 mb-2 border border-gray-100">
                        <div className="flex justify-between text-xs font-semibold mb-1">
                          <span className="text-gray-500">Progress</span>
                          <div className="text-right">
                            <span className="text-blue-700">{delivered} / {planned} L</span>
                            {monthlyPot.extra > 0 && <span className="text-[10px] text-purple-600 block">(+{monthlyPot.extra} L Rescheduled)</span>}
                          </div>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, percent)}%` }} /></div>
                        <div className="text-[10px] text-gray-400 mt-1 text-right flex justify-between items-center"><span className="text-xs text-gray-400">Remaining to Deliver:</span><span className="text-slate-800 font-bold bg-slate-100 px-2 py-0.5 rounded">{remaining} L</span></div>
                      </div>
                      {exceptions.length > 0 && (
                        <div className="mb-3 bg-yellow-50 rounded-lg p-2 border border-yellow-100 text-[11px] text-yellow-800 space-y-1">
                          <div className="flex items-center gap-1 font-bold text-yellow-700 uppercase tracking-wide text-[10px]"><AlertTriangle className="w-3 h-3" /> Changes/Exceptions</div>
                          {exceptions.map((ex, i) => (
                            <div key={i} className="flex gap-2 pl-1">
                              <span className="font-mono opacity-80 min-w-[50px]">{ex.date.slice(5)}:</span>
                              <span className={ex.type === 'skipped' ? 'text-red-600 line-through decoration-red-600/50' : 'text-green-700 font-medium'}>{ex.desc}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1 items-center">
                         {DAYS_OF_WEEK.map(day => { const qty = getQtyForDay(customer, day); return qty > 0 ? <span key={day} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded border border-blue-100">{day}: {qty}L</span> : null; })}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* REPORTS TAB */}
        {activeTab === 'reports' && (
          <div className="animate-in slide-in-from-right duration-300">
             <h2 className="text-2xl font-bold text-slate-800 mb-6">Monthly Report</h2>
             
             {/* NEW: Total Summary Card with Progress Bar */}
             <div className="bg-blue-600 text-white rounded-2xl p-6 shadow-lg mb-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-blue-200 text-sm font-bold uppercase tracking-wide mb-1">Total Delivered ({viewMonth})</p>
                      <p className="text-4xl font-extrabold">{grandTotalDelivered} <span className="text-lg font-medium opacity-70">Liters</span></p>
                    </div>
                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                      <Milk className="w-6 h-6 text-white" />
                    </div>
                </div>

                {/* PROGRESS BAR */}
                <div>
                    <div className="flex justify-between text-xs font-bold text-blue-200 mb-1">
                        <span>Progress</span>
                        <span>{Math.round(grandTotalProgress)}% of {grandTotalPlanned}L Goal</span>
                    </div>
                    <div className="w-full bg-blue-900/30 rounded-full h-3 overflow-hidden">
                        <div 
                            className="bg-white h-full rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(255,255,255,0.5)]" 
                            style={{ width: `${Math.min(100, grandTotalProgress)}%` }}
                        />
                    </div>
                </div>
             </div>

             {/* NEW: Daily Summary Card */}
             <div className="bg-emerald-600 text-white rounded-2xl p-6 shadow-lg mb-6 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                    <p className="text-emerald-200 text-sm font-bold uppercase tracking-wide">Daily Delivered</p>
                    <input 
                        type="date" 
                        value={reportDailyDate} 
                        onChange={e => setReportDailyDate(e.target.value)} 
                        className="bg-emerald-700 text-white border-none rounded px-2 py-1 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-400" 
                    />
                </div>
                <div className="flex justify-between items-end">
                     <p className="text-4xl font-extrabold">{reportDayTotal} <span className="text-lg font-medium opacity-70">Liters</span></p>
                     <p className="text-xs text-emerald-200 opacity-80">{getFormattedDate(reportDailyDate)}</p>
                </div>
             </div>

             <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex flex-col gap-4">
                <div><label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Select Month</label><input type="month" value={viewMonth} onChange={(e) => setViewMonth(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg font-medium text-slate-700 outline-none focus:border-blue-500" /></div>
                
                <div className="grid grid-cols-1 gap-3">
                   <button onClick={handleExportExcel} className="w-full py-3 bg-green-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-green-700 shadow-md"><FileSpreadsheet className="w-5 h-5" /> Export Monthly Plan (Excel)</button>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-2 pt-4 border-t border-gray-100">
                  <button onClick={handleExportData} className="w-full py-2 bg-blue-50 text-blue-600 font-bold rounded-lg flex items-center justify-center gap-2 hover:bg-blue-100 border border-blue-200 text-sm"><Download className="w-4 h-4" /> Backup Data</button>
                  <button onClick={handleRestoreClick} className="w-full py-2 bg-gray-50 text-gray-600 font-bold rounded-lg flex items-center justify-center gap-2 hover:bg-gray-200 border border-gray-200 text-sm"><Upload className="w-4 h-4" /> Restore Data</button>
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json" />
                </div>
                {isRestoring && <p className="text-center text-xs text-blue-500 font-bold animate-pulse">Restoring data...</p>}
             </div>
             <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"><table className="w-full text-left border-collapse"><thead><tr className="border-b border-gray-100"><th className="p-4 text-xs font-bold text-gray-400 uppercase">Name</th><th className="p-4 text-xs font-bold text-gray-400 uppercase text-right">Days</th><th className="p-4 text-xs font-bold text-gray-400 uppercase text-right">Total</th></tr></thead><tbody className="divide-y divide-gray-50">{Object.keys(reportData).length === 0 ? <tr><td colSpan="3" className="p-8 text-center text-gray-400 text-sm">No completed deliveries found for {viewMonth}.</td></tr> : Object.values(reportData).map((data, idx) => (<tr key={idx} className="hover:bg-blue-50/50 transition-colors"><td className="p-4 text-sm font-medium text-slate-800">{data.name}</td><td className="p-4 text-sm text-slate-500 text-right">{data.deliveriesCount}</td><td className="p-4 text-sm font-bold text-blue-600 text-right">{data.totalQty} L</td></tr>))}</tbody></table></div>
          </div>
        )}
      </main>

      {/* NAV */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe z-20">
        <div className="max-w-md mx-auto flex justify-around items-center h-16">
          <button 
            onClick={() => {
              setActiveTab('today');
              setTodayViewDate(getTodayString()); // RESETS DATE TO TODAY
            }} 
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${activeTab === 'today' ? 'text-blue-600' : 'text-gray-400'}`}
          >
            <Truck className="w-6 h-6" />
            <span className="text-[10px] font-bold">Today</span>
          </button>
          <button onClick={() => setActiveTab('customers')} className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${activeTab === 'customers' ? 'text-blue-600' : 'text-gray-400'}`}><Users className="w-6 h-6" /><span className="text-[10px] font-bold">Customers</span></button>
          <button onClick={() => setActiveTab('reports')} className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${activeTab === 'reports' ? 'text-blue-600' : 'text-gray-400'}`}><BarChart3 className="w-6 h-6" /><span className="text-[10px] font-bold">Reports</span></button>
        </div>
      </nav>

      {/* MODALS */}
      {showCustomerModal && <CustomerForm defaultMonth={viewMonth} initialData={editingCustomer} onClose={() => { setShowCustomerModal(false); setEditingCustomer(null); }} onSave={handleSaveCustomer} />}
      {selectedDelivery && <ActionModal delivery={selectedDelivery} onClose={() => setSelectedDelivery(null)} onUpdateStatus={toggleDeliveryStatus} onReschedule={handleReschedule} />}
      {deleteCandidate && <DeleteConfirmModal customer={deleteCandidate} onClose={() => setDeleteCandidate(null)} onConfirm={confirmDeleteCustomer} />}
    </div>
  );
}