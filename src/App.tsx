import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ShoppingCart, Settings, Search, Phone, Instagram, Facebook, 
  Trash2, Plus, Minus, Check, X, LogOut, LayoutDashboard, 
  Package, ShoppingBag, ClipboardList, Database, Globe,
  ExternalLink, ArrowUpRight, Camera
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, onSnapshot, query, orderBy, limit, addDoc, 
  setDoc, doc, deleteDoc, serverTimestamp, getDoc, getDocs 
} from 'firebase/firestore';
import { 
  signInWithPopup, GoogleAuthProvider, onAuthStateChanged, 
  signOut, User 
} from 'firebase/auth';
import { db, auth } from './firebase';

// --- Types ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email || '',
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface Product {
  id: string;
  name: string;
  cat: string;
  price: number;
  priceOld: number;
  sizes: string[];
  img: string;
  desc: string;
  stock: number;
  vendas: number;
  novo: boolean;
  createdAt: any;
}

interface Order {
  id: string;
  data: string;
  cliente: { nome: string; telefone: string };
  itens: CartItem[];
  subtotal: number;
  total: number;
  frete: { tipo: string; valor: number; prazo: string };
  status: string;
  rastreio: string;
  origem: string;
  createdAt: any;
}

interface CartItem {
  _key: string;
  produtoId: string;
  nome: string;
  tamanho: string;
  quantidade: number;
  preco: number;
  imagem: string;
}

interface StoreConfig {
  whatsapp: string;
  instagram: string;
  facebook: string;
  storeName: string;
  address: string;
}

// --- Constants ---
const DEFAULT_CONFIG: StoreConfig = {
  whatsapp: '5566996579199',
  instagram: 'https://instagram.com/mix_shoes_sinop',
  facebook: 'https://facebook.com/mixshoes',
  storeName: 'MIX SHOES',
  address: 'Rua das Nogueiras, 383 - Sinop/MT'
};

const CATEGORIES = [
  'Masculino', 'Feminino'
];

export default function App() {
  // --- Global State ---
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [config, setConfig] = useState<StoreConfig>(DEFAULT_CONFIG);
  const [user, setUser] = useState<User | null>(null);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  
  // --- UI State ---
  const [currentFilter, setCurrentFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize] = useState('');
  const [modalQty, setModalQty] = useState(1);
  const [toast, setToast] = useState<{msg: string, show: boolean}>({msg: '', show: false});
  const [scrolled, setScrolled] = useState(false);

  // --- Shipping State ---
  const [cep, setCep] = useState('');
  const [shippingCost, setShippingCost] = useState(0);
  const [shippingName, setShippingName] = useState('');
  const [shippingPrazo, setShippingPrazo] = useState('');
  const [shippingLoading, setShippingLoading] = useState(false);

  // --- Admin Panel States ---
  const [activeAdminTab, setActiveAdminTab] = useState('dashboard');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  // --- Auth & Real-time Listeners ---
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      // If user is jonas, grant admin access automatically if they sign in via Google
      if (u?.email === 'jonassantosclaro@gmail.com') {
        setIsAdminMode(true);
      }
    });

    const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
      const pData = snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
      setProducts(pData);
      setLoading(false);
    }, (err) => {
      if (err.message.includes('Missing or insufficient permissions')) {
        handleFirestoreError(err, OperationType.LIST, 'products');
      }
      console.error('Products listener error:', err);
      setLoading(false);
    });

    const unsubConfig = onSnapshot(doc(db, 'config', 'main'), (snap) => {
      if (snap.exists()) {
        setConfig(snap.data() as StoreConfig);
      }
    }, (err) => {
      if (err.message.includes('Missing or insufficient permissions')) {
        handleFirestoreError(err, OperationType.GET, 'config/main');
      }
    });

    return () => {
      unsubAuth();
      unsubProducts();
      unsubConfig();
    };
  }, []);

  // Separate effect for orders, only if admin
  useEffect(() => {
    if (!isAdminMode) {
      setOrders([]);
      return;
    }

    const unsubOrders = onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(100)), (snap) => {
      const oData = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      setOrders(oData);
    }, (err) => {
      if (err.message.includes('Missing or insufficient permissions')) {
        // Likely lost admin privileges or session expired
        console.warn('Orders permission error - user might not be logged in as admin in Firebase yet');
      }
    });

    return () => unsubOrders();
  }, [isAdminMode]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // --- Helpers ---
  const showToast = (msg: string) => {
    setToast({ msg, show: true });
    setTimeout(() => setToast({ msg: '', show: false }), 3000);
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesCat = currentFilter === 'all' || p.cat === currentFilter;
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            p.cat.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [products, currentFilter, searchQuery]);

  const cartTotal = useMemo(() => cart.reduce((acc, item) => acc + (item.preco * item.quantidade), 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((acc, item) => acc + item.quantidade, 0), [cart]);

  // --- Cart Actions ---
  const addToCart = (p: Product, size: string, qty: number) => {
    if (!size) {
      showToast('⚠️ Selecione um tamanho!');
      return;
    }
    const key = `${p.id}_${size}`;
    setCart(prev => {
      const ex = prev.find(item => item._key === key);
      if (ex) {
        return prev.map(item => item._key === key ? { ...item, quantidade: item.quantidade + qty } : item);
      }
      return [...prev, {
        _key: key,
        produtoId: p.id,
        nome: p.name,
        tamanho: size,
        quantidade: qty,
        preco: p.price,
        imagem: p.img
      }];
    });
    showToast(`✅ ${p.name} adicionado!`);
  };

  const removeFromCart = (key: string) => {
    setCart(prev => prev.filter(i => i._key !== key));
    showToast('Produto removido');
  };

  const updateCartQty = (key: string, delta: number) => {
    setCart(prev => prev.map(item => 
      item._key === key ? { ...item, quantidade: Math.max(1, item.quantidade + delta) } : item
    ));
  };

  const handleCEP = async (val: string) => {
    const clean = val.replace(/\D/g, '');
    let formatted = clean;
    if (clean.length > 5) formatted = clean.slice(0, 5) + '-' + clean.slice(5, 8);
    setCep(formatted);
    
    if (clean.length === 8) {
      setShippingLoading(true);
      try {
        const r = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
        const d = await r.json();
        if (d.erro) {
          showToast('❌ CEP não encontrado');
          setShippingLoading(false);
          return;
        }
        // Simulation as in original HTML
        const pac = d.uf === 'MT' ? 24.90 : 39.90;
        setShippingCost(pac);
        setShippingName('PAC');
        setShippingPrazo('8 dias úteis');
      } catch(e) {
        showToast('⚠ Erro ao calcular frete');
      }
      setShippingLoading(false);
    }
  };

  const finalizeOrder = async (name: string, phone: string) => {
    if (!cart.length) return;
    if (!name || !phone) {
      showToast('⚠ Preencha seus dados!');
      return;
    }
    
    const orderData = {
      data: new Date().toLocaleString('pt-BR'),
      cliente: { nome: name, telefone: phone },
      itens: cart,
      subtotal: cartTotal,
      total: cartTotal + shippingCost,
      frete: { tipo: shippingName, valor: shippingCost, prazo: shippingPrazo },
      status: 'Pendente',
      rastreio: '',
      origem: 'Site',
      createdAt: serverTimestamp()
    };

    try {
      await addDoc(collection(db, 'orders'), orderData);
      
      let msg = `🛒 *Pedido MIX SHOES*\n━━━━━━━━━━━━━━━━━━\n`;
      msg += `👤 *Cliente:* ${name}\n📱 *WhatsApp:* ${phone}\n\n*🛍 PRODUTOS:*\n`;
      cart.forEach(item => {
        msg += `• ${item.nome}\n  📏 Tam: ${item.tamanho} | Qtd: ${item.quantidade}\n  💰 R$ ${(item.preco * item.quantidade).toFixed(2)}\n`;
      });
      msg += `\n━━━━━━━━━━━━━━━━━━\n📦 *Frete:* ${shippingName} — R$ ${shippingCost.toFixed(2)}\n💰 *TOTAL: R$ ${(cartTotal + shippingCost).toFixed(2)}*\n━━━━━━━━━━━━━━━━━━\n`;
      
      window.open(`https://wa.me/${config.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
      setCart([]);
      setCartOpen(false);
      showToast('✅ Pedido enviado!');
    } catch(e) {
      console.error(e);
      showToast('❌ Erro ao processar pedido');
    }
  };

  // --- Admin Panel ---
  const seedInitialData = async () => {
    if (products.length > 0) {
      showToast('Estoque já contém produtos');
      return;
    }
    showToast('🚀 Semeando dados...');
    const SEED_PRODS = [
      {name:'Air Max Dn',cat:'Masculino',price:110,priceOld:0,sizes:['38','39','40','41','42','43'],img:'https://dcdn-us.mitiendanube.com/stores/007/557/906/products/whatsapp-image-2026-03-18-at-10-09-01-0357e63f121e08a25517762770498843-480-0.webp',desc:'Air Max DN - Modelo exclusivo',stock:20,vendas:0,novo:true,createdAt: Date.now()},
      {name:'Mizuno Premium',cat:'Masculino',price:68,priceOld:0,sizes:['38','39','40','41','42','43'],img:'https://dcdn-us.mitiendanube.com/stores/007/557/906/products/whatsapp-image-2026-03-31-at-11-03-11-e60d52667cc422904d17761776414876-480-0.webp',desc:'Mizuno Running - Alta Performace',stock:15,vendas:0,novo:true,createdAt: Date.now()},
      {name:'Samba Plataforma',cat:'Feminino',price:120,priceOld:0,sizes:['34','35','36','37','38','39'],img:'',desc:'Adidas Samba Plataforma - Estilo e Conforto',stock:12,vendas:0,novo:true,createdAt: Date.now()},
      {name:'Air Force 1 Shadow',cat:'Feminino',price:95,priceOld:0,sizes:['34','35','36','37','38'],img:'',desc:'Nike AF1 Shadow White',stock:10,vendas:0,novo:false,createdAt: Date.now()},
    ];
    for (const p of SEED_PRODS) {
      await addDoc(collection(db, 'products'), p);
    }
    showToast('✅ Dados importados!');
  };

  const handleAdminLogin = async (u: string, s: string) => {
    if (u === 'mixshoes' && s === 'adminmixshoes') {
      setIsAdminMode(true);
      showToast('🔓 Acesso Admin Liberado');
    } else {
      showToast('❌ Credenciais incorretas');
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-bg flex flex-col items-center justify-center gap-6">
        <div className="font-bebas text-6xl tracking-widest flex gap-2">
          <span className="text-cyan">MIX</span>
          <span className="text-orange">SHOES</span>
        </div>
        <div className="w-48 h-1 bg-border rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-gradient-to-r from-cyan to-orange"
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        </div>
        <div className="text-muted text-sm tracking-widest uppercase">Carregando catálogo...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-white font-sans selection:bg-cyan/30">
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-[-1] bg-radial-[circle_at_20%_30%] from-cyan/[0.08] to-transparent" />
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-[-1] bg-radial-[circle_at_80%_70%] from-orange/[0.08] to-transparent" />

      {/* Topbar */}
      <div className="hidden sm:flex h-10 bg-[#0A0C10] border-b border-border items-center justify-between px-6 text-xs font-medium tracking-wide">
        <span className="text-muted">Mix Shoes — Qualidade e preços imbatíveis</span>
        <a href={`https://wa.me/${config.whatsapp}`} target="_blank" className="text-green flex items-center gap-2 hover:text-white transition-colors">
          <Phone size={14} fill="currentColor" />
          {config.whatsapp}
        </a>
      </div>

      {/* Header */}
      <header className={`h-[72px] sticky top-0 z-50 border-b border-border transition-all ${scrolled ? 'bg-bg/95 backdrop-blur-md h-[64px]' : 'bg-bg/90 backdrop-blur-sm'}`}>
        <div className="max-w-[1400px] mx-auto px-6 h-full flex items-center justify-between gap-6">
          <button onClick={() => setCurrentFilter('all')} className="flex items-center gap-3 active:scale-95 transition-transform">
            <div className="font-bebas text-3xl tracking-wider flex gap-1">
              <span className="text-cyan">MIX</span>
              <span className="text-orange">SHOES</span>
            </div>
          </button>

          <div className="hidden md:flex flex-1 max-w-xl relative">
            <input 
              type="text" 
              placeholder="Buscar tênis, sneakers, lançamentos..."
              className="w-full bg-bg3 border border-border rounded-full py-2.5 px-6 pr-12 text-sm focus:border-cyan outline-none transition-all focus:ring-4 focus:ring-cyan/10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search className="absolute right-5 top-1/2 -translate-y-1/2 text-muted" size={18} />
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => setCartOpen(true)}
              className="bg-cyan text-black px-5 py-2 rounded-full font-bold text-sm flex items-center gap-2 shadow-[0_0_20px_rgba(0,200,255,0.4)] hover:shadow-[0_0_30px_rgba(0,200,255,0.6)] hover:-translate-y-0.5 transition-all"
            >
              <ShoppingCart size={18} />
              <span className="hidden sm:inline">Carrinho</span>
              <span className="bg-black text-orange rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-black">{cartCount}</span>
            </button>
            <button 
              onClick={() => isAdminMode ? setAdminPanelOpen(true) : setIsAdminMode(true)}
              className="p-2.5 border border-border rounded-full text-muted hover:border-cyan hover:text-cyan transition-all"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Nav */}
      <nav className="bg-bg2 border-b border-border sticky top-[72px] sm:top-[72px] z-40">
        <div className="max-w-[1400px] mx-auto px-6 flex items-center gap-1 overflow-x-auto no-scrollbar">
          <button 
            onClick={() => setCurrentFilter('all')}
            className={`px-5 py-3.5 text-xs font-bold uppercase tracking-[0.15em] border-b-2 transition-all whitespace-nowrap ${currentFilter === 'all' ? 'text-cyan border-cyan' : 'text-muted border-transparent hover:text-white'}`}
          >
            🏠 Todos
          </button>
          {CATEGORIES.map(cat => (
            <button 
              key={cat}
              onClick={() => setCurrentFilter(cat)}
              className={`px-5 py-3.5 text-xs font-bold uppercase tracking-[0.15em] border-b-2 transition-all whitespace-nowrap ${currentFilter === cat ? 'text-cyan border-cyan' : 'text-muted border-transparent hover:text-white'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </nav>

      {/* Hero (Only on "All") */}
      {currentFilter === 'all' && !searchQuery && (
        <section className="max-w-[1400px] mx-auto px-6 py-16 grid lg:grid-cols-2 items-center gap-12 overflow-hidden">
          <motion.div 
            initial={{ opacity: 0, x: -30 }} 
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-block bg-cyan/10 border border-cyan/30 text-cyan px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-6">
              ✨ Coleção 2026 — PREMIUM QUALITY
            </div>
            <h1 className="font-bebas text-[clamp(4rem,10vw,8rem)] leading-[0.9] tracking-tight mb-6">
              <span className="text-cyan drop-shadow-[0_0_40px_rgba(0,200,255,0.4)]">MIX</span><br />
              <span className="text-orange drop-shadow-[0_0_40px_rgba(255,140,0,0.3)]">SHOES</span>
            </h1>
            <p className="text-muted text-lg max-w-lg leading-relaxed mb-10">
              Os melhores tênis importados, chuteiras profissionais e moda esportiva com os preços mais competitivos do mercado.
            </p>
            <div className="flex flex-wrap gap-4">
              <button 
                onClick={() => document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' })}
                className="bg-cyan text-black px-10 py-4 rounded-2xl font-black text-base shadow-[0_10px_30px_rgba(0,200,255,0.3)] hover:-translate-y-1 hover:shadow-[0_15px_40px_rgba(0,200,255,0.5)] transition-all"
              >
                Ver Catálogo 👟
              </button>
              <button 
                onClick={() => window.open(`https://wa.me/${config.whatsapp}`, '_blank')}
                className="border-2 border-orange text-orange px-10 py-4 rounded-2xl font-black text-base hover:bg-orange hover:text-black hover:-translate-y-1 transition-all"
              >
                WhatsApp 💬
              </button>
            </div>
          </motion.div>
          
          <motion.div 
            className="relative hidden lg:flex justify-center items-center h-[500px]"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="absolute w-[400px] h-[400px] bg-cyan/10 blur-[100px] rounded-full animate-pulse" />
            <div className="absolute w-[300px] h-[300px] bg-orange/10 blur-[80px] rounded-full animate-pulse [animation-delay:1s]" />
            <div className="font-bebas text-[180px] text-transparent stroke-1 stroke-cyan/20 select-none tracking-[0.1em] italic -rotate-12">SNEAKERS</div>
          </motion.div>
        </section>
      )}

      {/* Catalog */}
      <main id="catalog" className="max-w-[1400px] mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div className="flex flex-col">
            <h2 className="text-2xl font-black tracking-tight">{currentFilter === 'all' ? 'Lançamentos' : currentFilter}</h2>
            <span className="text-muted text-xs uppercase tracking-widest">{filteredProducts.length} produtos encontrados</span>
          </div>
          <div className="flex gap-2">
            {/* Filter tags could go here */}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
          <AnimatePresence mode="popLayout">
            {filteredProducts.map(p => (
              <motion.div 
                layout
                key={p.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                whileHover={{ y: -8 }}
                className="group bg-bg2 border border-border rounded-2xl overflow-hidden cursor-pointer hover:border-cyan/30 hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all"
                onClick={() => setSelectedProduct(p)}
              >
                <div className="aspect-square bg-bg3 relative overflow-hidden">
                  {p.novo && <div className="absolute top-3 left-3 bg-cyan text-black px-2.5 py-1 rounded-full text-[9px] font-black z-10">NOVO</div>}
                  {p.priceOld > 0 && (
                    <div className="absolute top-3 left-3 bg-orange text-black px-2.5 py-1 rounded-full text-[9px] font-black z-10">
                      -{Math.round((1 - p.price/p.priceOld) * 100)}%
                    </div>
                  )}
                  {p.img ? (
                    <img src={p.img} alt={p.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl opacity-20">👟</div>
                  )}
                </div>
                <div className="p-4">
                  <div className="text-[10px] text-muted uppercase tracking-widest mb-1">{p.cat}</div>
                  <h3 className="font-bold text-sm mb-2 line-clamp-1">{p.name}</h3>
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="font-bebas text-2xl text-orange">R$ {p.price.toFixed(2)}</span>
                    {p.priceOld > 0 && <span className="text-muted text-xs line-through">R$ {p.priceOld.toFixed(2)}</span>}
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); addToCart(p, p.sizes[0], 1); }}
                    className="w-full bg-cyan/10 border border-cyan/20 text-cyan py-2.5 rounded-xl font-bold text-xs hover:bg-cyan hover:text-black transition-all"
                  >
                    Adicionar 🛒
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {filteredProducts.length === 0 && (
          <div className="text-center py-20 bg-bg2 rounded-3xl border border-dashed border-border">
            <Search className="mx-auto text-muted mb-4 opacity-30" size={48} />
            <div className="text-muted text-lg">Nenhum produto encontrado para sua busca</div>
            <button onClick={() => { setSearchQuery(''); setCurrentFilter('all'); }} className="mt-4 text-cyan text-sm underline">Limpar filtros</button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-bg2 border-t border-border mt-20 pt-20 pb-10">
        <div className="max-w-[1400px] mx-auto px-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-12 mb-20">
          <div>
            <div className="font-bebas text-3xl tracking-wider mb-6">
              <span className="text-cyan">MIX</span>
              <span className="text-orange">SHOES</span>
            </div>
            <p className="text-muted text-sm leading-relaxed mb-6">
              A melhor loja de calçados e moda esportiva de Sinop-MT e região. Qualidade garantida e envio para todo o país.
            </p>
            <div className="flex gap-4">
              <a href={config.instagram} className="w-10 h-10 rounded-full bg-bg3 border border-border flex items-center justify-center hover:border-cyan hover:text-cyan transition-all"><Instagram size={18} /></a>
              <a href={config.facebook} className="w-10 h-10 rounded-full bg-bg3 border border-border flex items-center justify-center hover:border-cyan hover:text-cyan transition-all"><Facebook size={18} /></a>
              <a href={`https://wa.me/${config.whatsapp}`} className="w-10 h-10 rounded-full bg-bg3 border border-border flex items-center justify-center hover:border-cyan hover:text-cyan transition-all"><Phone size={18} /></a>
            </div>
          </div>
          
          <div>
            <h4 className="font-bold text-sm uppercase tracking-widest mb-6">Categorias</h4>
            <ul className="space-y-3 text-sm text-muted">
              {CATEGORIES.map(c => (
                <li key={c}><button onClick={() => setCurrentFilter(c)} className="hover:text-cyan transition-colors">👟 {c}</button></li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-sm uppercase tracking-widest mb-6">Contato</h4>
            <ul className="space-y-4 text-sm text-muted">
              <li className="flex gap-3">📍 <span>{config.address}</span></li>
              <li className="flex gap-3">📱 <span>{config.whatsapp}</span></li>
              <li className="flex gap-3">⏰ <span>Seg–Sáb: 8h às 20h</span></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-sm uppercase tracking-widest mb-6">Institucional</h4>
            <ul className="space-y-3 text-sm text-muted">
              <li><button className="hover:text-cyan transition-colors">Sobre nós</button></li>
              <li><button className="hover:text-cyan transition-colors">Trocas e Devoluções</button></li>
              <li><button className="hover:text-cyan transition-colors">Prazos de Entrega</button></li>
              <li className="text-[10px] mt-4 pt-4 border-t border-border opacity-50">CNPJ: 45.336.886/0001-87</li>
            </ul>
          </div>
        </div>

        <div className="max-w-[1400px] mx-auto px-6 pt-10 border-t border-border flex flex-col md:flex-row justify-between items-center gap-6 text-[10px] text-muted uppercase tracking-[0.2em] font-bold">
          <span>© 2026 Mix Shoes. Todos os direitos reservados.</span>
          <button onClick={() => setIsAdminMode(true)} className="opacity-30 hover:opacity-100 transition-opacity">Área Administrativa</button>
        </div>
      </footer>

      {/* Modals --- implemented as overlay components or simple conditional render --- */}
      
      {/* Product Modal */}
      <AnimatePresence>
        {selectedProduct && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-12 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setSelectedProduct(null)}
              className="fixed inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-bg3 border border-border rounded-[2rem] max-w-5xl w-full grid md:grid-cols-2 overflow-hidden shadow-[0_50px_100px_rgba(0,0,0,0.8)]"
            >
              <button 
                onClick={() => setSelectedProduct(null)}
                className="absolute top-6 right-6 z-10 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all"
              >
                <X size={20} />
              </button>

              <div className="bg-bg2 p-8 flex items-center justify-center min-h-[400px]">
                {selectedProduct.img ? (
                  <img src={selectedProduct.img} alt={selectedProduct.name} className="max-w-full max-h-full object-contain rounded-2xl" />
                ) : (
                  <div className="text-9xl opacity-10">👟</div>
                )}
              </div>

              <div className="p-8 sm:p-12 flex flex-col">
                <div className="text-xs text-muted uppercase tracking-[0.2em] font-bold mb-2">{selectedProduct.cat}</div>
                <h2 className="font-bebas text-5xl mb-4 leading-none">{selectedProduct.name}</h2>
                <div className="font-bebas text-4xl text-orange mb-6">R$ {selectedProduct.price.toFixed(2)}</div>
                
                {selectedProduct.desc && (
                  <p className="text-muted text-sm leading-relaxed mb-8">{selectedProduct.desc}</p>
                )}

                <div className="mb-8">
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted mb-4">Escolha o seu tamanho:</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedProduct.sizes.map(s => (
                      <button 
                        key={s}
                        onClick={() => setSelectedSize(s)}
                        className={`w-14 h-14 rounded-2xl border-2 font-black transition-all ${selectedSize === s ? 'bg-cyan/10 border-cyan text-cyan' : 'bg-bg2 border-border hover:border-cyan/50'}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-auto space-y-4">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center bg-bg2 rounded-2xl border border-border p-1">
                      <button onClick={() => setModalQty(Math.max(1, modalQty-1))} className="w-10 h-10 flex items-center justify-center hover:text-cyan transition-colors"><Minus size={18} /></button>
                      <span className="font-bebas text-2xl w-10 text-center">{modalQty}</span>
                      <button onClick={() => setModalQty(modalQty+1)} className="w-10 h-10 flex items-center justify-center hover:text-cyan transition-colors"><Plus size={18} /></button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button 
                      onClick={() => { addToCart(selectedProduct, selectedSize, modalQty); setSelectedProduct(null); }}
                      className="bg-cyan text-black py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg"
                    >
                      Adicionar ao Carrinho
                    </button>
                    <button 
                      onClick={() => {
                        window.open(`https://wa.me/${config.whatsapp}?text=${encodeURIComponent(`Quero comprar o ${selectedProduct.name} (${selectedSize})`)}`, '_blank');
                      }}
                      className="bg-green py-4 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                      <Phone size={18} fill="currentColor" /> Direct WhatsApp
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cart Sidebar */}
      <AnimatePresence>
        {cartOpen && (
          <div className="fixed inset-0 z-[200]">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setCartOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute top-0 right-0 h-full w-full max-w-[450px] bg-bg2 border-l border-border flex flex-col shadow-[-20px_0_60px_rgba(0,0,0,0.5)]"
            >
              <div className="p-6 border-b border-border flex items-center justify-between">
                <span className="font-bebas text-2xl tracking-widest">🛒 CARRINHO</span>
                <button onClick={() => setCartOpen(false)} className="text-muted hover:text-white transition-colors"><X /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-30 gap-4">
                    <ShoppingBag size={80} strokeWidth={1} />
                    <span className="font-medium">Seu carrinho está vazio</span>
                  </div>
                ) : (
                  <>
                    {cart.map(item => (
                      <div key={item._key} className="flex gap-4 group">
                        <div className="w-20 h-20 bg-bg3 rounded-xl overflow-hidden shrink-0">
                          {item.imagem ? <img src={item.imagem} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-2xl">👟</div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm mb-1 truncate">{item.nome}</div>
                          <div className="text-[10px] text-muted uppercase tracking-widest mb-3">Tam: {item.tamanho}</div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center bg-bg rounded-lg border border-border p-0.5">
                              <button onClick={() => updateCartQty(item._key, -1)} className="w-7 h-7 flex items-center justify-center hover:text-cyan"><Minus size={14} /></button>
                              <span className="font-bebas text-lg w-7 text-center">{item.quantidade}</span>
                              <button onClick={() => updateCartQty(item._key, 1)} className="w-7 h-7 flex items-center justify-center hover:text-cyan"><Plus size={14} /></button>
                            </div>
                            <span className="font-bebas text-xl text-orange">R$ {(item.preco * item.quantidade).toFixed(2)}</span>
                          </div>
                        </div>
                        <button onClick={() => removeFromCart(item._key)} className="opacity-0 group-hover:opacity-100 p-2 text-red hover:bg-red/10 rounded-lg transition-all self-start">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    
                    <div className="bg-bg3 p-6 rounded-3xl border border-border">
                      <div className="text-xs font-bold uppercase tracking-widest mb-4">🏠 Calcular Frete</div>
                      <div className="flex gap-2 mb-4">
                        <input 
                          type="text" 
                          placeholder="00000-000" 
                          className="flex-1 bg-bg border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-cyan"
                          value={cep}
                          onChange={(e) => handleCEP(e.target.value)}
                          maxLength={9}
                        />
                      </div>
                      {shippingLoading && <div className="text-[10px] text-cyan animate-pulse">Consultando prazos...</div>}
                      {shippingCost > 0 && (
                        <div className="flex items-center justify-between p-3 bg-cyan/5 border border-cyan/20 rounded-xl">
                          <div className="text-[10px] font-black">{shippingName} — {shippingPrazo}</div>
                          <div className="text-cyan font-bold">R$ {shippingCost.toFixed(2)}</div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="p-6 border-t border-border bg-bg3">
                <div className="space-y-2 mb-6">
                  <div className="flex justify-between text-xs text-muted"><span>Subtotal</span><span>R$ {cartTotal.toFixed(2)}</span></div>
                  <div className="flex justify-between text-xs text-muted"><span>Frete</span><span>R$ {shippingCost.toFixed(2)}</span></div>
                  <div className="flex justify-between font-bebas text-3xl border-t border-border pt-4 mt-2"><span>TOTAL</span><span className="text-cyan">R$ {(cartTotal + shippingCost).toFixed(2)}</span></div>
                </div>

                {cart.length > 0 && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                       <input id="finalName" type="text" placeholder="Seu nome completo" className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-cyan" />
                       <input id="finalPhone" type="tel" placeholder="Seu WhatsApp" className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-cyan" />
                    </div>
                    <button 
                      onClick={() => {
                        const n = (document.getElementById('finalName') as HTMLInputElement).value;
                        const p = (document.getElementById('finalPhone') as HTMLInputElement).value;
                        finalizeOrder(n, p);
                      }}
                      className="w-full bg-green text-white py-5 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-all"
                    >
                      <Phone size={20} fill="currentColor" /> Enviar Pedido
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Panel (A simplified identical-feeling modal) */}
      <AnimatePresence>
        {isAdminMode && (
          <div className={`fixed inset-0 z-[300] bg-black/95 backdrop-blur-xl p-6 overflow-y-auto ${!adminPanelOpen ? 'flex items-center justify-center' : ''}`}>
             {!adminPanelOpen ? (
               <motion.div initial={{ y: 20 }} animate={{ y: 0 }} className="bg-bg2 border border-border p-12 rounded-[2.5rem] max-w-md w-full text-center">
                  <div className="w-20 h-20 bg-bg3 border border-border rounded-3xl flex items-center justify-center mx-auto mb-8 text-cyan">
                    <Database size={40} />
                  </div>
                  <h2 className="font-bebas text-4xl mb-2">PAINEL DE CONTROLE</h2>
                  <p className="text-muted text-sm mb-10">Mix Shoes — Área Administrativa</p>
                  <div className="space-y-4">
                    <input id="admU" type="text" placeholder="Usuário" className="w-full bg-bg3 border border-border rounded-2xl px-6 py-4 outline-none focus:border-cyan" defaultValue="mixshoes" />
                    <input id="admP" type="password" placeholder="Senha" className="w-full bg-bg3 border border-border rounded-2xl px-6 py-4 outline-none focus:border-cyan" defaultValue="adminmixshoes" />
                    <button 
                      onClick={() => {
                        const u = (document.getElementById('admU') as HTMLInputElement).value;
                        const p = (document.getElementById('admP') as HTMLInputElement).value;
                        if(u === 'mixshoes' && p === 'adminmixshoes') { setAdminPanelOpen(true); } else { showToast('❌ Incorreto'); }
                      }}
                      className="w-full bg-cyan text-black py-4 rounded-2xl font-black text-sm uppercase tracking-widest"
                    >
                      Acessar Painel
                    </button>
                    <div className="pt-4 border-t border-border mt-4">
                      <button 
                        onClick={async () => {
                          try {
                            const provider = new GoogleAuthProvider();
                            await signInWithPopup(auth, provider);
                            setAdminPanelOpen(true);
                          } catch(e) { showToast('❌ Erro no login'); }
                        }}
                        className="w-full bg-white text-black py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                      >
                         Entrar com Google
                      </button>
                    </div>
                    <button onClick={() => setIsAdminMode(false)} className="text-muted text-xs underline">Voltar para Loja</button>
                  </div>
               </motion.div>
             ) : (
               <motion.div className="w-full flex flex-col max-w-7xl mx-auto">
                 <div className="flex items-center justify-between py-6 border-b border-border mb-10">
                   <div className="font-bebas text-4xl">PAINEL <span className="text-cyan">MIX SHOES</span></div>
                   <div className="flex items-center gap-4">
                     <span className="text-[10px] text-green font-black uppercase tracking-widest">🔥 ONLINE</span>
                     <button onClick={() => { setAdminPanelOpen(false); setIsAdminMode(false); }} className="bg-bg3 border border-border px-6 py-3 rounded-full text-xs font-bold hover:bg-white/5 transition-all">Sair</button>
                   </div>
                 </div>

                 <div className="flex gap-2 overflow-x-auto no-scrollbar mb-10 bg-bg2 p-1.5 rounded-3xl border border-border w-fit">
                    {[
                      {id: 'dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard'},
                      {id: 'products', icon: <Package size={18} />, label: 'Produtos'},
                      {id: 'pdv', icon: <ShoppingBag size={18} />, label: 'PDV / Estoque'},
                      {id: 'orders', icon: <ClipboardList size={18} />, label: 'Pedidos'},
                      {id: 'import', icon: <Globe size={18} />, label: 'Importar'},
                      {id: 'config', icon: <Settings size={18} />, label: 'Config'}
                    ].map(tab => (
                      <button 
                        key={tab.id}
                        onClick={() => setActiveAdminTab(tab.id)}
                        className={`flex items-center gap-3 px-6 py-3.5 rounded-[1.25rem] text-sm font-bold transition-all ${activeAdminTab === tab.id ? 'bg-bg3 text-cyan shadow-lg' : 'text-muted hover:text-white'}`}
                      >
                        {tab.icon}
                        {tab.label}
                      </button>
                    ))}
                 </div>

                 <div className="flex-1">
                   {activeAdminTab === 'dashboard' && (
                     <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="bg-bg3 border border-border p-8 rounded-[2rem] cursor-pointer hover:border-cyan/50 transition-all" onClick={seedInitialData}>
                          <div className="text-cyan font-bebas text-5xl mb-2">{products.length}</div>
                          <div className="text-[10px] font-black text-muted uppercase tracking-widest">Total Produtos / Seed 🔄</div>
                        </div>
                        <div className="bg-bg3 border border-border p-8 rounded-[2rem]">
                          <div className="text-orange font-bebas text-5xl mb-2">{orders.length}</div>
                          <div className="text-[10px] font-black text-muted uppercase tracking-widest">Total Pedidos</div>
                        </div>
                        <div className="bg-bg3 border border-border p-8 rounded-[2rem]">
                          <div className="text-green font-bebas text-5xl mb-2">R$ {orders.reduce((acc,o)=>acc+o.total,0).toFixed(0)}</div>
                          <div className="text-[10px] font-black text-muted uppercase tracking-widest">Faturamento</div>
                        </div>
                        <div className="bg-bg3 border border-border p-8 rounded-[2rem]">
                          <div className="text-red font-bebas text-5xl mb-2">{orders.filter(o=>o.status==='Pendente').length}</div>
                          <div className="text-[10px] font-black text-muted uppercase tracking-widest">Ped. Pendentes</div>
                        </div>
                        
                        <div className="lg:col-span-4 bg-bg3 border border-border rounded-[2.5rem] p-8 mt-6">
                           <h3 className="font-bebas text-2xl mb-6">ÚLTIMOS PEDIDOS</h3>
                           <div className="overflow-x-auto">
                             <table className="w-full text-left text-sm">
                               <thead>
                                 <tr className="text-[10px] uppercase tracking-widest text-muted border-b border-border">
                                   <th className="pb-4">Cliente</th>
                                   <th className="pb-4">Produtos</th>
                                   <th className="pb-4">Total</th>
                                   <th className="pb-4">Status</th>
                                 </tr>
                               </thead>
                               <tbody className="divide-y divide-border">
                                 {orders.slice(0, 5).map(o => (
                                   <tr key={o.id} className="text-muted hover:text-white transition-colors">
                                     <td className="py-4 font-bold">{o.cliente.nome}</td>
                                     <td className="py-4 text-xs">{o.itens.length} itens</td>
                                     <td className="py-4 font-bebas text-lg text-orange">R$ {o.total.toFixed(2)}</td>
                                     <td className="py-4">
                                       <span className={`px-3 py-1 rounded-full text-[9px] font-black ${o.status==='Pendente' ? 'bg-orange/10 text-orange' : 'bg-green/10 text-green'}`}>{o.status}</span>
                                     </td>
                                   </tr>
                                 ))}
                               </tbody>
                             </table>
                           </div>
                        </div>
                     </div>
                   )}

                   {activeAdminTab === 'products' && (
                     <div className="space-y-6">
                        <div className="flex justify-between items-center">
                          <h2 className="font-bebas text-3xl">ESTOQUE ATUAL</h2>
                          <button 
                            onClick={() => { setEditingProduct(null); setIsProductModalOpen(true); }}
                            className="bg-cyan text-black px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest"
                          >
                            Novo Produto +
                          </button>
                        </div>
                        <div className="bg-bg3 border border-border rounded-[2.5rem] overflow-hidden">
                           <table className="w-full text-left">
                             <thead>
                               <tr className="bg-bg2/50 text-[10px] font-black uppercase tracking-widest text-muted border-b border-border">
                                 <th className="p-6">Imagem</th>
                                 <th className="p-6">Nome</th>
                                 <th className="p-6">Preço</th>
                                 <th className="p-6">Status</th>
                                 <th className="p-6">Ações</th>
                               </tr>
                             </thead>
                             <tbody className="divide-y divide-border">
                               {products.map(p => (
                                 <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                                   <td className="p-6"><img src={p.img} className="w-12 h-12 rounded-lg object-cover" /></td>
                                   <td className="p-6 font-bold text-sm">{p.name}</td>
                                   <td className="p-6 font-bebas text-xl text-orange">R$ {p.price.toFixed(2)}</td>
                                   <td className="p-6">
                                     <span className={`px-3 py-1 rounded-full text-[9px] font-black ${p.stock > 0 ? 'bg-green/10 text-green' : 'bg-red/10 text-red'}`}>{p.stock > 0 ? 'ATIVO' : 'SEM ESTOQUE'}</span>
                                   </td>
                                   <td className="p-6">
                                     <div className="flex gap-2">
                                       <button 
                                          onClick={() => { setEditingProduct(p); setIsProductModalOpen(true); }}
                                          className="p-2.5 bg-bg border border-border rounded-xl text-muted hover:text-cyan transition-all"
                                       >
                                          <Settings size={14} />
                                       </button>
                                       <button 
                                          onClick={async () => {
                                             if(confirm('🗑 Excluir este produto permanentemente?')) {
                                               await deleteDoc(doc(db, 'products', p.id));
                                               showToast('✅ Produto excluído');
                                             }
                                          }}
                                          className="p-2.5 bg-bg border border-border rounded-xl text-muted hover:text-red transition-all"
                                       >
                                          <Trash2 size={14} />
                                       </button>
                                     </div>
                                   </td>
                                 </tr>
                               ))}
                             </tbody>
                           </table>
                        </div>
                     </div>
                   )}

                   {activeAdminTab === 'orders' && (
                     <div className="space-y-6">
                        <h2 className="font-bebas text-3xl">GERENCIAR PEDIDOS</h2>
                        <div className="bg-bg3 border border-border rounded-[2.5rem] overflow-hidden">
                           <table className="w-full text-left text-sm">
                               <thead>
                                 <tr className="bg-bg2/50 text-[10px] font-black uppercase tracking-widest text-muted border-b border-border">
                                   <th className="p-6">ID / Data</th>
                                   <th className="p-6">Cliente</th>
                                   <th className="p-6">Canal</th>
                                   <th className="p-6">Total</th>
                                   <th className="p-6">Status</th>
                                   <th className="p-6 text-right">Ações</th>
                                 </tr>
                               </thead>
                               <tbody className="divide-y divide-border">
                                 {orders.map(o => (
                                   <tr key={o.id} className="hover:bg-white/[0.02] transition-colors">
                                     <td className="p-6">
                                       <div className="font-bold text-xs">#{o.id.slice(0,6)}</div>
                                       <div className="text-[10px] opacity-50">{o.data.split(',')[0]}</div>
                                     </td>
                                     <td className="p-6">
                                       <div className="font-bold">{o.cliente.nome}</div>
                                       <div className="text-[10px] opacity-50">{o.cliente.telefone}</div>
                                     </td>
                                     <td className="p-6">
                                       <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter ${o.origem === 'PDV' ? 'bg-orange/20 text-orange' : 'bg-cyan/20 text-cyan'}`}>{o.origem || 'Site'}</span>
                                     </td>
                                     <td className="p-6 font-bebas text-xl text-orange">R$ {o.total.toFixed(2)}</td>
                                     <td className="p-6">
                                       <select 
                                         value={o.status} 
                                         onChange={async (e) => {
                                            await setDoc(doc(db, 'orders', o.id), { ...o, status: e.target.value });
                                            showToast('✅ Status atualizado');
                                         }}
                                         className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase border-none outline-none appearance-none cursor-pointer ${
                                            o.status === 'Pago' ? 'bg-green/10 text-green' : 
                                            o.status === 'Cancelado' ? 'bg-red/10 text-red' : 
                                            'bg-orange/10 text-orange'
                                         }`}
                                       >
                                         <option value="Pendente">Pendente</option>
                                         <option value="Pago">Pago</option>
                                         <option value="Enviado">Enviado</option>
                                         <option value="Cancelado">Cancelado</option>
                                       </select>
                                     </td>
                                     <td className="p-6 text-right">
                                       <div className="flex justify-end gap-2">
                                         <button onClick={() => { setViewingOrder(o); setIsOrderModalOpen(true); }} className="p-2.5 bg-bg border border-border rounded-xl text-muted hover:text-cyan transition-all"><ExternalLink size={14} /></button>
                                         <button onClick={async () => {
                                           if(confirm('❌ Excluir registro do pedido?')) {
                                             await deleteDoc(doc(db, 'orders', o.id));
                                             showToast('🗑 Pedido removido');
                                           }
                                         }} className="p-2.5 bg-bg border border-border rounded-xl text-muted hover:text-red transition-all"><Trash2 size={14} /></button>
                                       </div>
                                     </td>
                                   </tr>
                                 ))}
                               </tbody>
                           </table>
                        </div>
                     </div>
                   )}
                   
                   {activeAdminTab === 'pdv' && (
                     <div className="space-y-10">
                        <div className="bg-bg3 border border-border p-10 rounded-[2.5rem]">
                            <h3 className="font-bebas text-3xl mb-8 flex items-center gap-3">🏪 PDV - CONTROLE DE ESTOQUE</h3>
                            
                            <div className="grid lg:grid-cols-[1fr_350px] gap-8">
                                <div className="space-y-6">
                                    <div className="relative">
                                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-muted" size={18} />
                                        <input 
                                            type="text" 
                                            placeholder="Buscar produto por nome..." 
                                            className="w-full bg-bg border border-border rounded-2xl py-4 pl-14 pr-6 outline-none focus:border-cyan text-sm"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-h-[500px] overflow-y-auto no-scrollbar pr-2">
                                        {products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).map(p => (
                                            <button 
                                                key={p.id}
                                                onClick={() => {
                                                    const s = prompt(`Tamanho para ${p.name}:`, p.sizes[0]);
                                                    if(s) addToCart(p, s, 1);
                                                }}
                                                className="bg-bg2 border border-border p-4 rounded-2xl text-left hover:border-cyan/50 transition-all group"
                                            >
                                                <div className="aspect-square bg-bg3 rounded-xl mb-3 overflow-hidden">
                                                    <img src={p.img} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                                                </div>
                                                <div className="font-bold text-xs truncate mb-1">{p.name}</div>
                                                <div className="text-orange font-bebas text-lg">R$ {p.price.toFixed(2)}</div>
                                                <div className={`text-[9px] font-black uppercase tracking-widest mt-1 ${p.stock <= 5 ? 'text-red' : 'text-green'}`}>Estoque: {p.stock}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="bg-bg2 border border-border rounded-[2rem] p-6 flex flex-col">
                                    <h4 className="font-bebas text-xl border-b border-border pb-4 mb-6">REGISTRO DE SAÍDA</h4>
                                    <div className="flex-1 space-y-4 max-h-[300px] overflow-y-auto no-scrollbar mb-6">
                                        {cart.length === 0 ? (
                                            <div className="h-40 flex items-center justify-center text-muted text-xs uppercase tracking-widest font-bold opacity-30 italic">Nenhum item</div>
                                        ) : (
                                            cart.map(i => (
                                                <div key={i._key} className="flex justify-between items-center text-sm">
                                                    <div className="min-w-0">
                                                        <div className="font-bold truncate">{i.nome}</div>
                                                        <div className="text-[10px] text-muted">TAM: {i.tamanho} x{i.quantidade}</div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="font-bebas text-orange">R$ {(i.preco * i.quantidade).toFixed(2)}</span>
                                                        <button onClick={() => removeFromCart(i._key)} className="text-red hover:bg-red/10 p-2 rounded-lg transition-all"><X size={14} /></button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                    
                                    <div className="mt-auto pt-6 border-t border-border space-y-6">
                                        <div className="flex justify-between font-bebas text-3xl"><span>TOTAL</span><span className="text-cyan">R$ {cartTotal.toFixed(2)}</span></div>
                                        <button 
                                            disabled={cart.length === 0}
                                            onClick={async () => {
                                                // Real PDV logic: update stock in firebase
                                                showToast('📦 Atualizando estoque...');
                                                try {
                                                    for (const item of cart) {
                                                        const p = products.find(prod => prod.id === item.produtoId);
                                                        if (p) {
                                                            await setDoc(doc(db, 'products', p.id), {
                                                                ...p,
                                                                stock: Math.max(0, p.stock - item.quantidade),
                                                                vendas: (p.vendas || 0) + item.quantidade
                                                            });
                                                        }
                                                    }
                                                    // Register internal order
                                                    await addDoc(collection(db, 'orders'), {
                                                        data: new Date().toLocaleString('pt-BR'),
                                                        cliente: { nome: 'VENDA LOJA (PDV)', telefone: 'Interno' },
                                                        itens: cart,
                                                        subtotal: cartTotal,
                                                        total: cartTotal,
                                                        frete: { tipo: 'Interno', valor: 0, prazo: '-' },
                                                        status: 'Pago',
                                                        origem: 'PDV',
                                                        createdAt: serverTimestamp()
                                                    });
                                                    setCart([]);
                                                    showToast('✅ Venda registrada e estoque atualizado!');
                                                } catch(e) { showToast('❌ Erro na atualização'); }
                                            }}
                                            className="w-full bg-cyan text-black py-4 rounded-2xl font-black text-xs uppercase tracking-widest disabled:opacity-20 transition-all flex items-center justify-center gap-3"
                                        >
                                            Confirmar Saída <ArrowUpRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-bg3 border border-border p-10 rounded-[2.5rem]">
                            <h3 className="font-bebas text-3xl mb-8 flex items-center gap-3 italic">📦 ENTRADA DE MERCADORIA</h3>
                            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                {products.map(p => (
                                    <div key={p.id} className="bg-bg2 border border-border p-6 rounded-3xl flex items-center justify-between group hover:border-orange/30 transition-all">
                                        <div>
                                            <div className="font-bold text-sm mb-1">{p.name}</div>
                                            <div className="text-[10px] text-muted font-black tracking-widest uppercase">Estoque: {p.stock}</div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button 
                                                onClick={() => setDoc(doc(db, 'products', p.id), { ...p, stock: p.stock + 1 })}
                                                className="w-10 h-10 rounded-xl bg-orange/10 text-orange flex items-center justify-center hover:bg-orange hover:text-black transition-all"
                                            >
                                                <Plus size={18} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                     </div>
                   )}

                   {activeAdminTab === 'import' && (
                     <div className="max-w-2xl space-y-8">
                        <div className="bg-bg3 border border-border p-10 rounded-[2.5rem]">
                           <h3 className="font-bebas text-2xl mb-8 flex items-center gap-3">📥 CAPTURAR PRODUTO</h3>
                           <div className="space-y-6">
                              <div>
                                <label className="text-[10px] font-black uppercase text-muted tracking-widest mb-3 block">URL DO PRODUTO (Loja Virtual Nuvem)</label>
                                <input id="importUrl" type="text" placeholder="https://..." className="w-full bg-bg rounded-2xl border border-border px-6 py-4 outline-none focus:border-cyan" />
                              </div>
                              <button className="w-full bg-cyan text-black py-5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg">Rastrear e Importar</button>
                           </div>
                        </div>
                     </div>
                   )}

                   {activeAdminTab === 'config' && (
                     <div className="max-w-3xl space-y-10">
                        <div className="bg-bg3 border border-border p-10 rounded-[2.5rem]">
                            <h3 className="font-bebas text-3xl mb-8 flex items-center gap-3">🛠 CONFIGURAÇÕES DO SITE</h3>
                            
                            <div className="grid md:grid-cols-2 gap-8 mb-10">
                                <div className="space-y-1.5 focus-within:text-cyan transition-colors">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-muted block ml-2">Nome da Loja</label>
                                    <input 
                                        type="text" 
                                        className="w-full bg-bg border border-border rounded-2xl px-6 py-4 outline-none focus:border-cyan"
                                        value={config.storeName}
                                        onChange={(e) => setConfig({...config, storeName: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-1.5 focus-within:text-cyan transition-colors">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-muted block ml-2">WhatsApp Geral</label>
                                    <input 
                                        type="text" 
                                        className="w-full bg-bg border border-border rounded-2xl px-6 py-4 outline-none focus:border-cyan"
                                        value={config.whatsapp}
                                        onChange={(e) => setConfig({...config, whatsapp: e.target.value})}
                                    />
                                </div>
                            </div>

                            <div className="space-y-8">
                                <div className="grid grid-cols-[60px_1fr] items-center gap-6 group">
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center shadow-lg"><Instagram size={28} /></div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-muted block">Link Instagram Oficial</label>
                                        <input 
                                            type="text" 
                                            className="w-full bg-bg border border-border rounded-2xl px-6 py-3.5 outline-none focus:border-cyan text-sm"
                                            value={config.instagram}
                                            onChange={(e) => setConfig({...config, instagram: e.target.value})}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-[60px_1fr] items-center gap-6 group">
                                    <div className="w-14 h-14 rounded-2xl bg-[#1877F2] flex items-center justify-center shadow-lg"><Facebook size={28} /></div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-muted block">Link Facebook Oficial</label>
                                        <input 
                                            type="text" 
                                            className="w-full bg-bg border border-border rounded-2xl px-6 py-3.5 outline-none focus:border-cyan text-sm"
                                            value={config.facebook}
                                            onChange={(e) => setConfig({...config, facebook: e.target.value})}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5 pt-4">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-muted block ml-2">Endereço da Loja Física</label>
                                    <textarea 
                                        rows={3}
                                        className="w-full bg-bg border border-border rounded-2xl px-6 py-4 outline-none focus:border-cyan text-sm"
                                        value={config.address}
                                        onChange={(e) => setConfig({...config, address: e.target.value})}
                                    />
                                </div>
                            </div>
                            
                            <motion.button 
                                whileTap={{ scale: 0.95 }}
                                onClick={async () => {
                                    showToast('💾 Gravando no Firebase...');
                                    try {
                                        await setDoc(doc(db, 'config', 'main'), config);
                                        showToast('✅ Configurações Salvas!');
                                    } catch(e) { showToast('❌ Erro ao salvar'); }
                                }}
                                className="mt-12 w-full bg-cyan text-black py-5 rounded-[1.5rem] font-black text-sm uppercase tracking-widest shadow-xl shadow-cyan/10 hover:shadow-cyan/20 transition-all flex items-center justify-center gap-3"
                            >
                                <Check size={20} /> Salvar Todas as Alterações
                            </motion.button>
                        </div>
                     </div>
                   )}
                 </div>
               </motion.div>
             )}
          </div>
        )}
      </AnimatePresence>

      {/* Admin Modals */}
      <AnimatePresence>
        {isProductModalOpen && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md">
            <motion.div initial={{ y: 20 }} animate={{ y: 0 }} className="bg-bg2 border border-border p-10 rounded-[2.5rem] max-w-2xl w-full max-h-[90vh] overflow-y-auto no-scrollbar">
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-bebas text-3xl">{editingProduct ? 'EDITAR PRODUTO' : 'NOVO PRODUTO'}</h3>
                <button onClick={() => setIsProductModalOpen(false)} className="p-2.5 bg-bg3 rounded-xl"><X size={20} /></button>
              </div>
              <div className="grid sm:grid-cols-2 gap-6">
                 <div className="sm:col-span-2">
                   <label className="text-[10px] font-black uppercase tracking-widest text-muted block ml-2 mb-2">Nome do Produto</label>
                   <input id="pName" type="text" defaultValue={editingProduct?.name || ''} className="w-full bg-bg3 border border-border rounded-2xl px-6 py-4 outline-none focus:border-cyan" />
                 </div>
                 <div>
                   <label className="text-[10px] font-black uppercase tracking-widest text-muted block ml-2 mb-2">Categoria</label>
                   <select id="pCat" defaultValue={editingProduct?.cat || 'Masculino'} className="w-full bg-bg3 border border-border rounded-2xl px-6 py-4 outline-none focus:border-cyan appearance-none">
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                   </select>
                 </div>
                 <div>
                   <label className="text-[10px] font-black uppercase tracking-widest text-muted block ml-2 mb-2">Preço (R$)</label>
                   <input id="pPrice" type="number" defaultValue={editingProduct?.price || ''} className="w-full bg-bg3 border border-border rounded-2xl px-6 py-4 outline-none focus:border-cyan" />
                 </div>
                 <div className="sm:col-span-2">
                   <label className="text-[10px] font-black uppercase tracking-widest text-muted block ml-2 mb-2">URL da Imagem</label>
                   <input id="pImg" type="text" defaultValue={editingProduct?.img || ''} className="w-full bg-bg3 border border-border rounded-2xl px-6 py-4 outline-none focus:border-cyan" />
                 </div>
                 <div>
                   <label className="text-[10px] font-black uppercase tracking-widest text-muted block ml-2 mb-2">Quantidade em Estoque</label>
                   <input id="pStock" type="number" defaultValue={editingProduct?.stock ?? 10} className="w-full bg-bg3 border border-border rounded-2xl px-6 py-4 outline-none focus:border-cyan" />
                 </div>
                 <div>
                   <label className="text-[10px] font-black uppercase tracking-widest text-muted block ml-2 mb-2">Tamanhos (ex: 38,39,40)</label>
                   <input id="pSizes" type="text" defaultValue={editingProduct?.sizes.join(',') || '38,39,40,41,42'} className="w-full bg-bg3 border border-border rounded-2xl px-6 py-4 outline-none focus:border-cyan" />
                 </div>
                 <div className="sm:col-span-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted block ml-2 mb-2">Descrição</label>
                    <textarea id="pDesc" rows={3} defaultValue={editingProduct?.desc || ''} className="w-full bg-bg3 border border-border rounded-2xl px-6 py-4 outline-none focus:border-cyan"></textarea>
                 </div>
              </div>
              <button 
                onClick={async () => {
                   const data = {
                      name: (document.getElementById('pName') as HTMLInputElement).value,
                      cat: (document.getElementById('pCat') as HTMLSelectElement).value,
                      price: Number((document.getElementById('pPrice') as HTMLInputElement).value),
                      img: (document.getElementById('pImg') as HTMLInputElement).value,
                      stock: Number((document.getElementById('pStock') as HTMLInputElement).value),
                      sizes: (document.getElementById('pSizes') as HTMLInputElement).value.split(',').map(s=>s.trim()),
                      desc: (document.getElementById('pDesc') as HTMLTextAreaElement).value,
                      priceOld: 0,
                      vendas: editingProduct?.vendas || 0,
                      novo: editingProduct?.novo ?? true,
                      createdAt: editingProduct?.createdAt || Date.now()
                   };
                   
                   if(!data.name || !data.price) { showToast('⚠ Preencha Nome e Preço'); return; }

                   showToast('💾 Salvando...');
                   try {
                     if(editingProduct) {
                       await setDoc(doc(db, 'products', editingProduct.id), data);
                     } else {
                       await addDoc(collection(db, 'products'), data);
                     }
                     setIsProductModalOpen(false);
                     showToast('✅ Sucesso!');
                   } catch(e) { showToast('❌ Erro no Firestore'); }
                }}
                className="w-full bg-cyan text-black py-5 rounded-2xl font-black text-sm uppercase tracking-widest mt-10 shadow-lg"
              >
                {editingProduct ? 'Atualizar Produto' : 'Cadastrar Produto'}
              </button>
            </motion.div>
          </div>
        )}

        {isOrderModalOpen && viewingOrder && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md">
             <motion.div initial={{ y: 20 }} animate={{ y: 0 }} className="bg-bg2 border border-border p-10 rounded-[2.5rem] max-w-2xl w-full">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="font-bebas text-3xl">DETALHES DO PEDIDO #{viewingOrder.id.slice(0,6)}</h3>
                  <button onClick={() => setIsOrderModalOpen(false)} className="p-2.5 bg-bg3 rounded-xl"><X size={20} /></button>
                </div>
                
                <div className="space-y-6">
                   <div className="grid grid-cols-2 gap-4">
                      <div className="bg-bg3 p-4 rounded-xl border border-border">
                         <div className="text-[10px] font-black text-muted uppercase mb-1">Cliente</div>
                         <div className="font-bold">{viewingOrder.cliente.nome}</div>
                         <div className="text-xs text-muted">{viewingOrder.cliente.telefone}</div>
                      </div>
                      <div className="bg-bg3 p-4 rounded-xl border border-border">
                         <div className="text-[10px] font-black text-muted uppercase mb-1">Data / Origem</div>
                         <div className="font-bold">{viewingOrder.data}</div>
                         <div className="text-xs text-cyan font-black uppercase tracking-tighter">{viewingOrder.origem || 'Site'}</div>
                      </div>
                   </div>

                   <div className="bg-bg3 rounded-2xl border border-border overflow-hidden">
                      <div className="p-4 bg-bg2 text-[10px] font-black uppercase tracking-widest text-muted border-b border-border">Itens do Pedido</div>
                      <div className="max-h-48 overflow-y-auto p-4 space-y-3">
                         {viewingOrder.itens.map(i => (
                           <div key={i._key} className="flex justify-between items-center text-sm">
                              <div>
                                 <span className="font-bold">{i.nome}</span>
                                 <span className="text-[10px] text-muted ml-2">TAM: {i.tamanho} (x{i.quantidade})</span>
                              </div>
                              <span className="font-bebas text-orange">R$ {(i.preco * i.quantidade).toFixed(2)}</span>
                           </div>
                         ))}
                      </div>
                      <div className="p-4 bg-bg2 flex justify-between items-center border-t border-border">
                         <span className="text-xs font-bold text-muted">TOTAL DO PEDIDO:</span>
                         <span className="font-bebas text-3xl text-cyan">R$ {viewingOrder.total.toFixed(2)}</span>
                      </div>
                   </div>

                   <div className="flex gap-4">
                      <button 
                        onClick={() => window.open(`https://wa.me/${viewingOrder.cliente.telefone.replace(/\D/g,'')}`, '_blank')}
                        className="flex-1 bg-green text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                      >
                         <Phone size={16} fill="currentColor" /> Chamar no WhatsApp
                      </button>
                      <button 
                        onClick={() => setIsOrderModalOpen(false)}
                        className="flex-1 bg-bg3 border border-border text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest"
                      >
                        Fechar
                      </button>
                   </div>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast.show && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[1000] bg-bg3 border border-border px-10 py-4 rounded-full font-bold text-sm shadow-[0_20px_60px_rgba(0,0,0,0.8)] whitespace-nowrap"
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
