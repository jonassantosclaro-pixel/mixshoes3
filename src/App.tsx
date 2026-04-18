import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ShoppingCart, Settings, Search, Phone, Instagram, Facebook, 
  Trash2, Plus, Minus, Check, X, LogOut, LayoutDashboard, 
  Package, ShoppingBag, ClipboardList, Database, Globe, Layers, RefreshCw,
  ExternalLink, ArrowUpRight, Camera, Bot, Send, Sparkles, MessageCircle,
  Menu, ChevronRight, ChevronLeft, User as UserIcon,
  Zap, Shirt, Activity, Baby
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { 
  collection, onSnapshot, query, orderBy, limit, addDoc, 
  setDoc, doc, deleteDoc, serverTimestamp, getDoc, getDocs 
} from 'firebase/firestore';
import { 
  signInWithPopup, GoogleAuthProvider, onAuthStateChanged, 
  signOut, User, signInWithEmailAndPassword, createUserWithEmailAndPassword
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
  subCat?: string;
  gender: 'Masculino' | 'Feminino' | 'Unisex';
  price: number;
  priceOld: number;
  sizes: string[];
  sizeStock: { [size: string]: number };
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
  'Tênis', 'Chuteira', 'Chinelo', 'Camisas', 'Conjunto Dryfit', 'Primeira Linha', 'Infantil', 'Feminino'
];

const GENDERS = ['Masculino', 'Feminino', 'Unisex'];
const SUB_CATEGORIES = ['Nenhuma', '34 ao 43', 'INFANTIL'];

// --- Components ---
interface ProductCardProps {
  p: Product;
  addToCart: (p: Product, size: string, qty: number) => void;
  setSelectedProduct: (p: Product) => void;
  key?: any;
}

function ProductCard({ p, addToCart, setSelectedProduct }: ProductCardProps) {
  return (
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
  );
}

export default function App() {
  // --- Global State ---
  const [loading, setLoading] = useState(true);
  const [minLoadingDone, setMinLoadingDone] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [config, setConfig] = useState<StoreConfig>(DEFAULT_CONFIG);
  const [user, setUser] = useState<User | null>(null);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);

  // --- AI Assistant State ---
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model', content: string }[]>([
    { role: 'model', content: 'Olá! Sou seu assistente MIX SHOES 👟 Como posso te ajudar hoje?' }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' }), []);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (chatOpen) scrollToBottom();
  }, [chatMessages, chatOpen]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;
    
    const newMessages = [...chatMessages, { role: 'user' as const, content: text }];
    setChatMessages(newMessages);
    setIsTyping(true);

    try {
      const prompt = `Você é um assistente virtual da loja MIX SHOES. 
      Sua função principal é ser simples e direto, auxiliando o cliente e direcionando para os canais oficiais de atendimento.
      
      DADOS DA LOJA:
      Nome: ${config.storeName}
      WhatsApp: ${config.whatsapp}
      Instagram: ${config.instagram}
      Facebook: ${config.facebook}
      
      INSTRUÇÕES:
      - Responda em UMA ou DUAS frases no máximo.
      - Seja amigável e use emojis 👟.
      - Se o cliente perguntar sobre produtos ou compras, diga que os botões abaixo ou o link do WhatsApp são os melhores canais.
      - Se ele quiser falar com um humano, mande-o para o WhatsApp.
      
      MENSAGEM DO CLIENTE: ${text}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });

      const aiText = response.text || "Desculpe, tive um problema técnico. Pode repetir?";
      setChatMessages([...newMessages, { role: 'model', content: aiText }]);
    } catch (error) {
      console.error('AI Error:', error);
      setChatMessages([...newMessages, { role: 'model', content: 'Ops! Estou um pouco ocupado agora, pode me chamar no WhatsApp? 📱' }]);
    } finally {
      setIsTyping(false);
    }
  };
  
  // --- UI State ---
  const [currentSection, setCurrentSection] = useState<'all' | 'Masculino' | 'Feminino'>('all');
  const [currentFilter, setCurrentFilter] = useState('all');
  const [currentSubCat, setCurrentSubCat] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize] = useState('');
  const [modalQty, setModalQty] = useState(1);
  const [toast, setToast] = useState<{msg: string, show: boolean}>({msg: '', show: false});
  const [scrolled, setScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuLevel, setMenuLevel] = useState(1);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [activeSubMenuId, setActiveSubMenuId] = useState<string | null>(null);

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
  const [modalSizeStock, setModalSizeStock] = useState<{ [size: string]: number }>({});
  const [modalSizes, setModalSizes] = useState<string[]>([]);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  const openProductModal = (p: Product | null) => {
    setEditingProduct(p);
    setModalSizeStock(p?.sizeStock || {});
    setModalSizes(p?.sizes || ['34','35','36','37','38','39','40','41','42','43']);
    setIsProductModalOpen(true);
  };

  // --- Auth & Real-time Listeners ---
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
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

    const timer = setTimeout(() => {
      setMinLoadingDone(true);
    }, 6000);

    // Check for public order parameter
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('order');
    if (orderId) {
      const getOrder = async () => {
        try {
          const snap = await getDoc(doc(db, 'orders', orderId));
          if (snap.exists()) {
            setViewingOrder({ id: snap.id, ...snap.data() } as Order);
            setIsOrderModalOpen(true);
          } else {
            showToast('❌ Pedido não encontrado');
          }
        } catch (err) {
          console.error("Error fetching public order:", err);
        }
      };
      getOrder();
    }

    return () => {
      unsubAuth();
      unsubProducts();
      unsubConfig();
      clearTimeout(timer);
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
      const matchesSection = currentSection === 'all' || p.gender === currentSection || p.gender === 'Unisex' || !p.gender;
      
      let matchesCat = currentFilter === 'all' || p.cat === currentFilter;
      
      // Broad matching for Camisas category
      const isShirtCat = (c: string) => {
        const lower = c.toLowerCase();
        return lower.includes('camisa') || lower.includes('conjunto') || lower.includes('dryfit') || lower === 'camisas';
      };

      if (currentFilter === 'Camisas') {
        matchesCat = isShirtCat(p.cat);
      }
      
      const matchesSubCat = currentSubCat === 'all' || p.subCat === currentSubCat;
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            p.cat.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSection && matchesCat && matchesSubCat && matchesSearch;
    });
  }, [products, currentSection, currentFilter, currentSubCat, searchQuery]);

  const cartTotal = useMemo(() => cart.reduce((acc, item) => acc + (item.preco * item.quantidade), 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((acc, item) => acc + item.quantidade, 0), [cart]);

  // --- Cart Actions ---
  const addToCart = (p: Product, size: string, qty: number) => {
    if (!size) {
      showToast('⚠️ Selecione um tamanho!');
      return;
    }
    const available = p.sizeStock?.[size] || 0;
    if (available <= 0) {
      showToast(`❌ Tamanho ${size} esgotado!`);
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

  const finalizeOrder = async (name: string, phone: string, address: string) => {
    if (!cart.length) return;
    if (!name || !phone || !address || !cep) {
      showToast('⚠ Preencha todos os dados de entrega!');
      return;
    }
    
    const orderData = {
      data: new Date().toLocaleString('pt-BR'),
      cliente: { nome: name, telefone: phone, endereco: address, cep: cep },
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
      for (const item of cart) {
        const p = products.find(prod => prod.id === item.produtoId);
        if (p) {
          const newSizeStock = { ...(p.sizeStock || {}) };
          const currentSizeStock = newSizeStock[item.tamanho] || 0;
          newSizeStock[item.tamanho] = Math.max(0, currentSizeStock - item.quantidade);
          const totalStock = Object.values(newSizeStock).reduce((acc: number, curr: any) => acc + (Number(curr) || 0), 0);
          
          await setDoc(doc(db, 'products', p.id), {
            ...p,
            stock: totalStock,
            sizeStock: newSizeStock,
            vendas: (p.vendas || 0) + item.quantidade
          });
        }
      }
      const docRef = await addDoc(collection(db, 'orders'), orderData);
      const orderUrl = `${window.location.origin}/?order=${docRef.id}`;
      
      let msg = `🛒 *NOVO PEDIDO - MIX SHOES*\n`;
      msg += `━━━━━━━━━━━━━━━━━━\n`;
      msg += `🆔 *Pedido:* #${docRef.id.slice(0,6).toUpperCase()}\n`;
      msg += `🔗 *Link do Pedido:* ${orderUrl}\n\n`;
      msg += `👤 *Cliente:* ${name}\n`;
      msg += `📱 *WhatsApp:* ${phone}\n`;
      msg += `📍 *Endereço:* ${address}\n`;
      msg += `📫 *CEP:* ${cep}\n\n`;
      msg += `*🛍 PRODUTOS:*\n`;
      
      cart.forEach(item => {
        msg += `✅ ${item.quantidade}x ${item.nome} (${item.tamanho})\n`;
        msg += `   💰 R$ ${(item.preco * item.quantidade).toFixed(2)}\n`;
        if (item.imagem) {
          msg += `   🖼 Ver Foto: ${item.imagem}\n`;
        }
        msg += `\n`;
      });
      
      msg += `━━━━━━━━━━━━━━━━━━\n`;
      msg += `📦 *Frete:* ${shippingName} — R$ ${shippingCost.toFixed(2)}\n`;
      msg += `💰 *VALOR TOTAL: R$ ${(cartTotal + shippingCost).toFixed(2)}*\n`;
      msg += `━━━━━━━━━━━━━━━━━━\n\n`;
      msg += `🚀 _Clique no link acima para ver as imagens e detalhes completos do pedido._`;
      
      window.open(`https://wa.me/${config.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
      setCart([]);
      setCartOpen(false);
      showToast('✅ Pedido enviado!');
    } catch(e) {
      handleFirestoreError(e, OperationType.CREATE, 'orders');
    }
  };

  // --- Admin Panel ---
  const seedInitialData = async () => {
    if (products.length > 0) {
      showToast('Estoque já contém produtos');
      return;
    }
    showToast('🚀 Semeando dados...');
    
    const FULL_RANGE = ['34','35','36','37','38','39','40','41','42','43'];
    const DEFAULT_STOCK_MAP = FULL_RANGE.reduce((acc, sz) => ({ ...acc, [sz]: 10 }), {});

    const SEED_PRODS = [
      {
        name:'Mizuno Prophecy',
        cat:'Tênis',
        gender:'Masculino',
        price:68,
        priceOld:0,
        sizes: FULL_RANGE,
        sizeStock: DEFAULT_STOCK_MAP,
        img:'https://picsum.photos/seed/mizuno/400/400',
        desc:'Mizuno Premium',
        stock: 100,
        vendas:0,
        novo:true,
        createdAt: Date.now()
      },
      {
        name:'Nike Shox TL',
        cat:'Tênis',
        gender:'Masculino',
        price:68,
        priceOld:0,
        sizes: FULL_RANGE,
        sizeStock: DEFAULT_STOCK_MAP,
        img:'https://picsum.photos/seed/shox/400/400',
        desc:'Nike Shox 12 molas',
        stock: 100,
        vendas:0,
        novo:true,
        createdAt: Date.now()
      },
      {
        name:'Samba Adidas',
        cat:'Feminino',
        gender:'Feminino',
        price:68,
        priceOld:0,
        sizes: FULL_RANGE,
        sizeStock: DEFAULT_STOCK_MAP,
        img:'https://picsum.photos/seed/samba/400/400',
        desc:'Estilo casual',
        stock: 100,
        vendas:0,
        novo:true,
        createdAt: Date.now()
      },
      {
        name:'Nike Chuteira Elite',
        cat:'Chuteira',
        gender:'Masculino',
        price:68,
        priceOld:0,
        sizes: FULL_RANGE,
        sizeStock: DEFAULT_STOCK_MAP,
        img:'https://picsum.photos/seed/chuteira/400/400',
        desc:'Alta performance em campo',
        stock: 100,
        vendas:0,
        novo:true,
        createdAt: Date.now()
      },
      {
        name:'Chinelo Slide',
        cat:'Chinelo',
        gender:'Unisex',
        price:68,
        priceOld:0,
        sizes: FULL_RANGE,
        sizeStock: DEFAULT_STOCK_MAP,
        img:'https://picsum.photos/seed/slide/400/400',
        desc:'Conforto absoluto',
        stock: 100,
        vendas:0,
        novo:true,
        createdAt: Date.now()
      },
      {
        name:'Camisa Flamengo 2026',
        cat:'Camisas',
        gender:'Masculino',
        price:99,
        priceOld:0,
        sizes:['P','M','G','GG'],
        sizeStock:{'P':10,'M':10,'G':10,'GG':10},
        img:'https://picsum.photos/seed/flamengo/400/400',
        desc:'Manto Sagrado',
        stock: 40,
        vendas:0,
        novo:true,
        createdAt: Date.now()
      },
      {
        name:'Conjunto Nike Dryfit Black',
        cat:'Conjunto Dryfit',
        gender:'Masculino',
        price:85,
        priceOld:0,
        sizes:['P','M','G','GG'],
        sizeStock:{'P':10,'M':10,'G':10,'GG':10},
        img:'https://picsum.photos/seed/dryfit/400/400',
        desc:'Conjunto para treino',
        stock: 40,
        vendas:0,
        novo:true,
        createdAt: Date.now()
      },
      {
        name:'Air Jordan 1 High',
        cat:'Primeira Linha',
        gender:'Unisex',
        price:150,
        priceOld:0,
        sizes: FULL_RANGE,
        sizeStock: DEFAULT_STOCK_MAP,
        img:'https://picsum.photos/seed/jordan/400/400',
        desc:'Colecionador',
        stock: 100,
        vendas:0,
        novo:true,
        createdAt: Date.now()
      },
      {
        name:'Nike Infantil Joy',
        cat:'Infantil',
        gender:'Unisex',
        price:68,
        priceOld:0,
        sizes: ['28','29','30','31','32','33'],
        sizeStock: {'28':10,'29':10,'30':10,'31':10,'32':10,'33':10},
        img:'https://picsum.photos/seed/kids/400/400',
        desc:'Para os pequenos',
        stock: 60,
        vendas:0,
        novo:true,
        createdAt: Date.now()
      },
    ];
    for (const p of SEED_PRODS) {
      await addDoc(collection(db, 'products'), p);
    }
    showToast('✅ Dados importados!');
  };

  const syncGlobalSizes = async () => {
    const FULL_RANGE = ['34','35','36','37','38','39','40','41','42','43'];
    showToast('🔄 Sincronizando grade global...');
    try {
        let count = 0;
        for (const p of products) {
            // Apply only to footwear/applicable categories if needed, 
            // but the user said "todos os itens"
            if (p.cat === 'Camisas' || p.cat === 'Conjunto Dryfit') continue; 

            const currentSizes = p.sizes || [];
            const needsUpdate = FULL_RANGE.some(s => !currentSizes.includes(s));
            
            if (needsUpdate || !p.sizeStock) {
                const newSizes = [...new Set([...currentSizes, ...FULL_RANGE])].sort((a,b) => Number(a) - Number(b));
                const newSizeStock = { ...(p.sizeStock || {}) };
                FULL_RANGE.forEach(s => {
                    if (newSizeStock[s] === undefined) newSizeStock[s] = 0;
                });
                const totalStock = Object.values(newSizeStock).reduce((acc: number, curr: any) => acc + (Number(curr) || 0), 0);
                await setDoc(doc(db, 'products', p.id), { ...p, sizes: newSizes, sizeStock: newSizeStock, stock: totalStock });
                count++;
            }
        }
        showToast(`✅ Grade 34-43 aplicada em ${count} produtos!`);
    } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, 'batch/sync-sizes');
    }
  };

  const handleAdminLogin = async (u: string, s: string) => {
    if (u === 'mixshoes' && s === 'adminmixshoes') {
      setIsAdminMode(true);
      showToast('🔓 Acesso Admin Liberado');
    } else {
      showToast('❌ Credenciais incorretas');
    }
  };

  if (loading || !minLoadingDone) {
    return (
      <div className="fixed inset-0 bg-bg flex flex-col items-center justify-center gap-6 z-[1000]">
        <div className="w-48 h-48 relative mb-8 flex items-center justify-center">
           <motion.img 
             src="https://dcdn-us.mitiendanube.com/stores/007/557/906/themes/common/logo-3496612179248405264-1776098643-0c2a0da76c2c3e0a22df20d1c9b471f51776098643-640-0.webp" 
             alt="Mix Shoes Logo"
             animate={{ 
                rotate: [0, -12, 0, 12, 0],
                y: [0, -25, 0, -25, 0],
                x: [-10, 10, -10, 10, -10]
             }}
             transition={{ 
                duration: 0.6, 
                repeat: Infinity,
                ease: "easeInOut" 
             }}
             className="w-full h-full object-contain brightness-125 drop-shadow-[0_0_30px_rgba(0,200,255,0.6)]"
             referrerPolicy="no-referrer"
             onError={(e) => {
               (e.target as HTMLImageElement).src = "https://picsum.photos/seed/mixshoes/200/200";
             }}
           />
           <div className="absolute -bottom-4 w-32 h-2 bg-black/40 rounded-[100%] blur-md animate-pulse" />
        </div>
        
        <div className="text-center space-y-4">
          <div className="font-bebas text-5xl tracking-[0.2em] flex gap-3 justify-center">
            <motion.span 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-cyan text-shadow-cyan"
            >
              MIX
            </motion.span>
            <motion.span 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="text-orange text-shadow-orange"
            >
              SHOES
            </motion.span>
          </div>
          
          <div className="flex flex-col items-center gap-3">
            <div className="w-64 h-1.5 bg-bg3 rounded-full overflow-hidden border border-border">
              <motion.div 
                className="h-full bg-gradient-to-r from-cyan via-white to-orange"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 6, ease: "linear" }}
              />
            </div>
            <motion.div 
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-muted text-[10px] font-black uppercase tracking-[0.3em]"
            >
              Sincronizando Catálogo...
            </motion.div>
          </div>
        </div>
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
        <a href={`https://wa.me/${config.whatsapp.replace(/\D/g, '')}`} target="_blank" className="text-green flex items-center gap-2 hover:text-cyan transition-all group">
          <MessageCircle size={14} className="fill-green group-hover:fill-cyan transition-all" />
          <span className="font-bold tracking-widest">WhatsApp Oficial</span>
        </a>
      </div>

      {/* Header */}
      <header 
        className="sticky top-0 z-50 transition-all font-sans"
      >
        {/* Logo and Search Bar Section (Main Header) */}
        <div className={`transition-all bg-bg/95 border-b border-white/5 ${scrolled ? 'py-1.5' : 'py-3'}`}>
          <div className="max-w-[1400px] mx-auto px-6 flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
               <button 
                 onClick={() => setIsMenuOpen(true)}
                 className="p-2 border border-border rounded-lg text-white hover:border-cyan hover:text-cyan transition-all md:hidden"
               >
                 <Menu size={22} />
               </button>
               <button onClick={() => { setCurrentFilter('all'); setCurrentSection('all'); setCurrentSubCat('all'); setSearchQuery(''); window.scrollTo({top: 0, behavior: 'smooth'}); }} className="flex items-center gap-3 group transition-transform">
                 <div className="w-10 h-10 relative shrink-0">
                   <img 
                      src="https://dcdn-us.mitiendanube.com/stores/007/557/906/themes/common/logo-3496612179248405264-1776098643-0c2a0da76c2c3e0a22df20d1c9b471f51776098643-640-0.webp" 
                      alt="Logo" 
                      className="w-full h-full object-contain brightness-110 group-hover:scale-110 transition-transform"
                      referrerPolicy="no-referrer"
                   />
                 </div>
                 <div className="font-bebas text-xl tracking-wider flex gap-1">
                   <span className="text-cyan text-shadow-cyan">MIX</span>
                   <span className="text-orange text-shadow-orange">SHOES</span>
                 </div>
               </button>
            </div>

            <div className="hidden lg:flex flex-1 max-w-xl relative mx-8">
              <input 
                type="text" 
                placeholder="Buscar produtos..."
                className="w-full bg-bg3 border border-border rounded-full py-2 px-6 pr-12 text-sm focus:border-cyan outline-none transition-all placeholder:text-muted/50"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search className="absolute right-5 top-1/2 -translate-y-1/2 text-muted/50" size={18} />
            </div>

            <div className="flex items-center gap-3">
              <button 
                onClick={() => setCartOpen(true)}
                className="bg-cyan text-black px-4 py-2 rounded-full font-bold text-xs flex items-center gap-2 shadow-[0_0_20px_rgba(0,200,255,0.3)] hover:shadow-[0_0_30px_rgba(0,200,255,0.5)] transition-all active:scale-95"
              >
                <ShoppingCart size={18} />
                <span className="hidden sm:inline uppercase">Carrinho</span>
                <span className="bg-black text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-black">{cartCount}</span>
              </button>
              <button 
                onClick={() => setIsAdminMode(true)}
                className="p-2.5 border border-border rounded-full text-muted hover:border-cyan hover:text-cyan transition-all group"
              >
                <Settings size={18} className="group-hover:rotate-45 transition-transform duration-500" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Areas */}
      {currentSection === 'all' && currentFilter === 'all' && currentSubCat === 'all' && !searchQuery && (
        <>
          {/* Central Products Menu (Main Navigation Hub) */}
          <div className="bg-gradient-to-r from-bg via-[#2E86C1] to-bg py-10 shadow-[0_10px_50px_-15px_rgba(46,134,193,0.4)] border-y border-white/5 mt-8 mb-4 relative overflow-hidden group">
            {/* Dynamic Light Sweep */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[3000ms] ease-out" />
            
            <div className="max-w-[1400px] mx-auto flex flex-col items-center justify-center relative z-10 px-6">
              <div className="flex items-center gap-8 w-full">
                <div className="hidden md:block flex-1 h-[2px] bg-gradient-to-r from-transparent via-white/10 to-white/30 rounded-full" />
                
                <div className="relative group/text">
                  {/* Subtle Glow */}
                  <div className="absolute inset-0 bg-white/20 blur-3xl opacity-0 group-hover/text:opacity-40 transition-opacity duration-1000" />
                  
                  <h2 className="relative font-bebas text-5xl md:text-8xl tracking-[0.15em] uppercase text-white leading-none drop-shadow-[0_5px_15px_rgba(0,0,0,0.3)]">
                    PRO<span className="text-cyan drop-shadow-[0_0_20px_rgba(34,211,238,0.5)]">DUTOS</span>
                  </h2>
                  
                  {/* Dynamic Underline */}
                  <div className="h-1 w-0 group-hover:w-full bg-cyan mx-auto transition-all duration-700 shadow-[0_0_10px_#00ffff]" />
                </div>

                <div className="hidden md:block flex-1 h-[2px] bg-gradient-to-l from-transparent via-white/10 to-white/30 rounded-full" />
              </div>
              
              <div className="mt-4 flex items-center gap-4">
                <div className="h-px w-8 bg-cyan/40" />
                <span className="text-[10px] font-black uppercase tracking-[0.5em] text-cyan/70">Coleção Premium 2026</span>
                <div className="h-px w-8 bg-cyan/40" />
              </div>
            </div>
          </div>

          <section className="relative py-16 overflow-hidden">
            {/* Elegant Background Accents */}
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan/5 blur-[120px] rounded-full" />
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-orange/5 blur-[120px] rounded-full" />
            
            <div className="max-w-[1400px] mx-auto px-10 relative z-10">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                 {/* Masculino */}
                 <motion.div 
                   whileHover={{ y: -5 }}
                   className="flex flex-col gap-6 p-6 rounded-3xl bg-white/[0.02] border border-white/5 backdrop-blur-sm hover:bg-white/[0.05] hover:border-cyan/30 transition-all duration-500 group"
                 >
                  <div className="flex items-center gap-3 text-cyan mb-2">
                    <div className="p-2 bg-cyan/10 rounded-lg"><ShoppingBag size={18} /></div>
                    <span className="text-[10px] font-black tracking-widest uppercase">Premium</span>
                  </div>
                  <button 
                    onClick={() => { setCurrentSection('Masculino'); setCurrentFilter('all'); setCurrentSubCat('all'); }}
                    className="font-bebas text-3xl tracking-wider text-left text-white group-hover:text-cyan transition-colors"
                  >
                    MASCULINO
                  </button>
                  <div className="flex flex-col gap-3 text-muted font-medium border-t border-white/5 pt-4">
                     <button onClick={() => { setCurrentSection('Masculino'); setCurrentFilter('Tênis'); setCurrentSubCat('34 ao 39'); }} className="text-[13px] hover:text-white flex items-center justify-between group/item">
                       <span>34 ao 39</span>
                       <ChevronRight size={14} className="opacity-0 group-hover/item:opacity-100 -translate-x-2 group-hover/item:translate-x-0 transition-all" />
                     </button>
                     <button onClick={() => { setCurrentSection('Masculino'); setCurrentFilter('Tênis'); setCurrentSubCat('39 ao 43'); }} className="text-[13px] hover:text-white flex items-center justify-between group/item">
                       <span>39 ao 43</span>
                       <ChevronRight size={14} className="opacity-0 group-hover/item:opacity-100 -translate-x-2 group-hover/item:translate-x-0 transition-all" />
                     </button>
                  </div>
                 </motion.div>

                 {/* Feminino */}
                 <motion.div 
                   whileHover={{ y: -5 }}
                   className="flex flex-col gap-6 p-6 rounded-3xl bg-white/[0.02] border border-white/5 backdrop-blur-sm hover:bg-white/[0.05] hover:border-pink-500/30 transition-all duration-500 group"
                 >
                  <div className="flex items-center gap-3 text-pink-500 mb-2">
                    <div className="p-2 bg-pink-500/10 rounded-lg"><Sparkles size={18} /></div>
                    <span className="text-[10px] font-black tracking-widest uppercase">Estilo</span>
                  </div>
                  <button 
                    onClick={() => { setCurrentSection('Feminino'); setCurrentFilter('all'); setCurrentSubCat('all'); }}
                    className="font-bebas text-3xl tracking-wider text-left text-white group-hover:text-pink-500 transition-colors"
                  >
                    FEMININO
                  </button>
                  <div className="flex flex-col gap-3 text-muted font-medium border-t border-white/5 pt-4">
                     <button onClick={() => { setCurrentSection('Feminino'); setCurrentFilter('all'); setCurrentSubCat('all'); }} className="text-[13px] hover:text-white flex items-center justify-between group/item">
                       <span>Ver Mais</span>
                       <ChevronRight size={14} className="opacity-0 group-hover/item:opacity-100 -translate-x-2 group-hover/item:translate-x-0 transition-all" />
                     </button>
                  </div>
                 </motion.div>

                 {/* Chuteira */}
                 <motion.div 
                   whileHover={{ y: -5 }}
                   className="flex flex-col gap-6 p-6 rounded-3xl bg-white/[0.02] border border-white/5 backdrop-blur-sm hover:bg-white/[0.05] hover:border-green/30 transition-all duration-500 group"
                 >
                  <div className="flex items-center gap-3 text-green mb-2">
                    <div className="p-2 bg-green/10 rounded-lg"><Check size={18} /></div>
                    <span className="text-[10px] font-black tracking-widest uppercase">Performance</span>
                  </div>
                  <button 
                    onClick={() => { setCurrentFilter('Chuteira'); setCurrentSubCat('all'); }}
                    className="font-bebas text-3xl tracking-wider text-left text-white group-hover:text-green transition-colors"
                  >
                    CHUTEIRAS
                  </button>
                  <div className="flex flex-col gap-3 text-muted font-medium border-t border-white/5 pt-4">
                     <button onClick={() => { setCurrentFilter('Chuteira'); setCurrentSubCat('34 ao 39'); }} className="text-[13px] hover:text-white flex items-center justify-between group/item">
                       <span>34 ao 39</span>
                       <ChevronRight size={14} className="opacity-0 group-hover/item:opacity-100 -translate-x-2 group-hover/item:translate-x-0 transition-all" />
                     </button>
                     <button onClick={() => { setCurrentFilter('Chuteira'); setCurrentSubCat('39 ao 43'); }} className="text-[13px] hover:text-white flex items-center justify-between group/item">
                       <span>39 ao 43</span>
                       <ChevronRight size={14} className="opacity-0 group-hover/item:opacity-100 -translate-x-2 group-hover/item:translate-x-0 transition-all" />
                     </button>
                  </div>
                 </motion.div>

                 {/* Chinelo */}
                 <motion.div 
                   whileHover={{ y: -5 }}
                   className="flex flex-col gap-6 p-6 rounded-3xl bg-white/[0.02] border border-white/5 backdrop-blur-sm hover:bg-white/[0.05] hover:border-orange/30 transition-all duration-500 group"
                 >
                  <div className="flex items-center gap-3 text-orange mb-2">
                    <div className="p-2 bg-orange/10 rounded-lg"><Sparkles size={18} /></div>
                    <span className="text-[10px] font-black tracking-widest uppercase">Conforto</span>
                  </div>
                  <button 
                    onClick={() => { setCurrentFilter('Chinelo'); setCurrentSubCat('all'); }}
                    className="font-bebas text-3xl tracking-wider text-left text-white group-hover:text-orange transition-colors"
                  >
                    CHINELOS
                  </button>
                  <div className="flex flex-col gap-3 text-muted font-medium border-t border-white/5 pt-4">
                     <button onClick={() => { setCurrentFilter('Chinelo'); setCurrentSubCat('34 ao 39'); }} className="text-[13px] hover:text-white flex items-center justify-between group/item">
                       <span>34 ao 39</span>
                       <ChevronRight size={14} className="opacity-0 group-hover/item:opacity-100 -translate-x-2 group-hover/item:translate-x-0 transition-all" />
                     </button>
                     <button onClick={() => { setCurrentFilter('Chinelo'); setCurrentSubCat('39 ao 43'); }} className="text-[13px] hover:text-white flex items-center justify-between group/item">
                       <span>39 ao 43</span>
                       <ChevronRight size={14} className="opacity-0 group-hover/item:opacity-100 -translate-x-2 group-hover/item:translate-x-0 transition-all" />
                     </button>
                  </div>
                 </motion.div>

                 {/* Camisas */}
                 <motion.div 
                   whileHover={{ y: -5 }}
                   className="flex flex-col gap-6 p-6 rounded-3xl bg-white/[0.02] border border-white/5 backdrop-blur-sm hover:bg-white/[0.05] hover:border-yellow-400/30 transition-all duration-500 group"
                 >
                  <div className="flex items-center gap-3 text-yellow-400 mb-2">
                    <div className="p-2 bg-yellow-400/10 rounded-lg"><Shirt size={18} /></div>
                    <span className="text-[10px] font-black tracking-widest uppercase">Esporte</span>
                  </div>
                  <button 
                    onClick={() => { setCurrentFilter('Camisas'); setCurrentSubCat('all'); }}
                    className="font-bebas text-3xl tracking-wider text-left text-white group-hover:text-yellow-400 transition-colors"
                  >
                    CAMISAS
                  </button>
                  <div className="flex flex-col gap-3 text-muted font-medium border-t border-white/5 pt-4">
                     <button onClick={() => { setCurrentFilter('Camisas'); setCurrentSubCat('all'); }} className="text-[13px] hover:text-white flex items-center justify-between group/item">
                       <span>Ver Todos</span>
                       <ChevronRight size={14} className="opacity-0 group-hover/item:opacity-100 -translate-x-2 group-hover/item:translate-x-0 transition-all" />
                     </button>
                  </div>
                 </motion.div>

                 {/* Conjunto Dry-Fit */}
                 <motion.div 
                   whileHover={{ y: -5 }}
                   className="flex flex-col gap-6 p-6 rounded-3xl bg-white/[0.02] border border-white/5 backdrop-blur-sm hover:bg-white/[0.05] hover:border-blue-400/30 transition-all duration-500 group"
                 >
                  <div className="flex items-center gap-3 text-blue-400 mb-2">
                    <div className="p-2 bg-blue-400/10 rounded-lg"><Activity size={18} /></div>
                    <span className="text-[10px] font-black tracking-widest uppercase">Tecnologia</span>
                  </div>
                  <button 
                    onClick={() => { setCurrentFilter('Conjunto Dryfit'); setCurrentSubCat('all'); }}
                    className="font-bebas text-3xl tracking-wider text-left text-white group-hover:text-blue-400 transition-colors"
                  >
                    CONJUNTO DRY-FIT
                  </button>
                  <div className="flex flex-col gap-3 text-muted font-medium border-t border-white/5 pt-4">
                     <button onClick={() => { setCurrentFilter('Conjunto Dryfit'); }} className="text-[13px] hover:text-white flex items-center justify-between group/item">
                       <span>Ver Coleção</span>
                       <ChevronRight size={14} className="opacity-0 group-hover/item:opacity-100 -translate-x-2 group-hover/item:translate-x-0 transition-all" />
                     </button>
                  </div>
                 </motion.div>

                 {/* Premium */}
                 <motion.div 
                   whileHover={{ y: -5 }}
                   className="flex flex-col gap-6 p-6 rounded-3xl bg-white/[0.02] border border-white/5 backdrop-blur-sm hover:bg-white/[0.05] hover:border-cyan/30 transition-all duration-500 group"
                 >
                  <div className="flex items-center gap-3 text-cyan mb-2">
                    <div className="p-2 bg-cyan/10 rounded-lg"><Sparkles size={18} /></div>
                    <span className="text-[10px] font-black tracking-widest uppercase">Premium</span>
                  </div>
                  <button 
                    onClick={() => { setCurrentFilter('Primeira Linha'); setCurrentSubCat('all'); }}
                    className="font-bebas text-3xl tracking-wider text-left text-white group-hover:text-cyan transition-colors"
                  >
                    1 ª LINHA
                  </button>
                  <div className="flex flex-col gap-3 text-muted font-medium border-t border-white/5 pt-4">
                     <button onClick={() => { setCurrentSection('Masculino'); setCurrentFilter('Primeira Linha'); }} className="text-[13px] hover:text-white flex items-center justify-between group/item">
                       <span>Masculino</span>
                       <ChevronRight size={14} className="opacity-0 group-hover/item:opacity-100 -translate-x-2 group-hover/item:translate-x-0 transition-all" />
                     </button>
                     <button onClick={() => { setCurrentSection('Feminino'); setCurrentFilter('Primeira Linha'); }} className="text-[13px] hover:text-white flex items-center justify-between group/item">
                       <span>Feminino</span>
                       <ChevronRight size={14} className="opacity-0 group-hover/item:opacity-100 -translate-x-2 group-hover/item:translate-x-0 transition-all" />
                     </button>
                  </div>
                 </motion.div>

                 {/* Infantil */}
                 <motion.div 
                   whileHover={{ y: -5 }}
                   className="flex flex-col gap-6 p-6 rounded-3xl bg-white/[0.02] border border-white/5 backdrop-blur-sm hover:bg-white/[0.05] hover:border-purple-500/30 transition-all duration-500 group"
                 >
                  <div className="flex items-center gap-3 text-purple-500 mb-2">
                    <div className="p-2 bg-purple-500/10 rounded-lg"><Baby size={18} /></div>
                    <span className="text-[10px] font-black tracking-widest uppercase">Kids</span>
                  </div>
                  <button 
                    onClick={() => { setCurrentFilter('Infantil'); setCurrentSubCat('all'); }}
                    className="font-bebas text-3xl tracking-wider text-left text-white group-hover:text-purple-500 transition-colors"
                  >
                    INFANTIL
                  </button>
                  <div className="flex flex-col gap-3 text-muted font-medium border-t border-white/5 pt-4">
                     <button onClick={() => { setCurrentSection('Masculino'); setCurrentFilter('Infantil'); }} className="text-[13px] hover:text-white flex items-center justify-between group/item">
                       <span>Masculino</span>
                       <ChevronRight size={14} className="opacity-0 group-hover/item:opacity-100 -translate-x-2 group-hover/item:translate-x-0 transition-all" />
                     </button>
                     <button onClick={() => { setCurrentSection('Feminino'); setCurrentFilter('Infantil'); }} className="text-[13px] hover:text-white flex items-center justify-between group/item">
                       <span>Feminino</span>
                       <ChevronRight size={14} className="opacity-0 group-hover/item:opacity-100 -translate-x-2 group-hover/item:translate-x-0 transition-all" />
                     </button>
                  </div>
                 </motion.div>
              </div>
            </div>
          </section>

          <section className="max-w-[1400px] mx-auto px-6 py-20">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center"
            >
              <h2 className="font-bebas text-6xl md:text-8xl tracking-tight mb-4">CONFIRA AS <span className="text-cyan text-shadow-cyan">NOVIDADES</span></h2>
              <p className="text-muted uppercase tracking-[0.3em] font-bold">O melhor da moda esportiva e premium do Brasil</p>
            </motion.div>
          </section>
        </>
      )}

      {/* Catalog & Dynamic Selection Grids */}
      {(currentSection !== 'all' || currentFilter !== 'all' || currentSubCat !== 'all' || searchQuery) && (
        <main id="catalog" className="max-w-[1400px] mx-auto px-6 py-12">
          
          {/* Standard Navigation Header - Applied to ALL views except Home Hub */}
          <div className="flex flex-col mb-12">
            <div className="flex items-center gap-4 mb-4">
              <button 
                onClick={() => { setCurrentSection('all'); setCurrentFilter('all'); setCurrentSubCat('all'); setSearchQuery(''); window.scrollTo({top: 0, behavior: 'smooth'}); }}
                className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-cyan hover:text-white transition-all bg-cyan/10 px-4 py-2 rounded-full border border-cyan/20 group"
              >
                <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> Voltar ao Início
              </button>
              <div className="h-px flex-1 bg-border" />
            </div>
            
            <div className="flex flex-col sm:flex-row items-baseline justify-between gap-4">
              <h2 className="font-bebas text-5xl md:text-7xl tracking-widest text-white uppercase">
                {searchQuery ? 'BUSCA' : (currentFilter !== 'all' ? currentFilter : currentSection)}
                {searchQuery && <span className="text-cyan ml-4 opacity-50 text-4xl">"{searchQuery}"</span>}
                {currentSubCat !== 'all' && currentSubCat !== 'Nenhuma' && <span className="text-cyan ml-4 opacity-50 text-4xl">{currentSubCat}</span>}
              </h2>
              <span className="text-muted text-[10px] sm:text-xs uppercase tracking-[0.3em] font-black bg-white/5 px-4 py-1 rounded-full border border-white/5">
                {filteredProducts.length} PRODUTOS ENCONTRADOS
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
            <AnimatePresence mode="popLayout">
              {filteredProducts.map(p => (
                <ProductCard key={p.id} p={p} addToCart={addToCart} setSelectedProduct={setSelectedProduct} />
              ))}
            </AnimatePresence>
          </div>

          {filteredProducts.length === 0 && (
            <div className="text-center py-20 bg-bg2 rounded-3xl border border-dashed border-border">
              <Search className="mx-auto text-muted mb-4 opacity-30" size={48} />
              <div className="text-muted text-lg">Nenhum produto encontrado para sua busca</div>
              <button onClick={() => { setCurrentSection('all'); setCurrentFilter('all'); setCurrentSubCat('all'); setSearchQuery(''); window.scrollTo({top: 0, behavior: 'smooth'}); }} className="mt-4 text-cyan text-sm underline">Limpar filtros e Voltar ao Início</button>
            </div>
          )}
        </main>
      )}

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
              <a href={config.instagram} target="_blank" className="w-10 h-10 rounded-full bg-bg3 border border-border flex items-center justify-center hover:border-cyan hover:text-cyan transition-all"><Instagram size={18} /></a>
              <a href={config.facebook} target="_blank" className="w-10 h-10 rounded-full bg-bg3 border border-border flex items-center justify-center hover:border-cyan hover:text-cyan transition-all"><Facebook size={18} /></a>
              <a href={`https://wa.me/${config.whatsapp.replace(/\D/g, '')}`} target="_blank" className="w-10 h-10 rounded-full bg-bg3 border border-border flex items-center justify-center hover:border-cyan hover:text-cyan transition-all"><MessageCircle size={18} className="fill-green/20" /></a>
            </div>
          </div>
          
          <div>
            <h4 className="font-bold text-sm uppercase tracking-widest mb-6">Categorias</h4>
            <ul className="space-y-3 text-sm text-muted">
              {CATEGORIES.map(c => (
                <li key={c}><button onClick={() => { setCurrentFilter(c); setCurrentSubCat('all'); }} className="hover:text-cyan transition-colors">👟 {c}</button></li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-sm uppercase tracking-widest mb-6">Contato</h4>
            <ul className="space-y-4 text-sm text-muted">
              <li className="flex gap-3">📍 <span>{config.address}</span></li>
              <li className="flex gap-3">
                <a href={`https://wa.me/${config.whatsapp.replace(/\D/g, '')}`} target="_blank" className="flex items-center gap-2 hover:text-cyan transition-colors">
                  <MessageCircle size={16} className="text-green" /> WhatsApp: {config.whatsapp}
                </a>
              </li>
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

        {/* Floating Buttons */}
      <div className="fixed bottom-8 right-8 z-[100] flex flex-col gap-4">
        <a 
          href={`https://wa.me/${config.whatsapp.replace(/\D/g, '')}`}
          target="_blank"
          className="w-16 h-16 bg-green text-white rounded-full flex items-center justify-center shadow-[0_10px_30px_rgba(34,197,94,0.4)] hover:scale-110 active:scale-95 transition-all group relative"
        >
          <MessageCircle size={32} className="fill-white/20" />
          <span className="absolute right-full mr-4 bg-white text-black px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl">
             Chamar no WhatsApp 📱
          </span>
        </a>

        <button 
          onClick={() => setChatOpen(!chatOpen)}
          className="w-16 h-16 bg-cyan text-black rounded-full flex items-center justify-center shadow-[0_10px_30px_rgba(0,200,255,0.4)] hover:scale-110 active:scale-95 transition-all group relative"
        >
          {chatOpen ? <X size={32} /> : <Bot size={32} />}
          <span className="absolute right-full mr-4 bg-white text-black px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl">
             Assistente Virtual ✨
          </span>
        </button>
      </div>

      {/* AI Chat Layout */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-28 right-8 z-[101] w-[380px] h-[550px] bg-bg2 border border-border rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden backdrop-blur-xl"
          >
            <div className="bg-bg3 p-6 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-cyan/10 rounded-xl flex items-center justify-center text-cyan">
                  <Bot size={24} />
                </div>
                <div>
                  <div className="font-bebas text-xl tracking-wider">ASSISTENTE <span className="text-cyan text-[0.8em]">MIX</span></div>
                  <div className="flex items-center gap-1.5 leading-none">
                    <span className="w-1.5 h-1.5 bg-green rounded-full animate-pulse" />
                    <span className="text-[10px] text-muted uppercase font-black">Online Agora</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setChatOpen(false)} className="text-muted hover:text-white transition-colors"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="flex flex-wrap gap-2 mb-4">
                 <a 
                   href={`https://wa.me/${config.whatsapp.replace(/\D/g, '')}`} 
                   target="_blank"
                   className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green/10 border border-green/20 rounded-xl text-green text-[10px] font-black uppercase tracking-wider hover:bg-green hover:text-white transition-all"
                 >
                   <MessageCircle size={14} /> WhatsApp
                 </a>
                 <a 
                   href={config.instagram} 
                   target="_blank"
                   className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-pink-500/10 border border-pink-500/20 rounded-xl text-pink-500 text-[10px] font-black uppercase tracking-wider hover:bg-pink-500 hover:text-white transition-all"
                 >
                   <Instagram size={14} /> Instagram
                 </a>
                 <a 
                   href={config.facebook} 
                   target="_blank"
                   className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-500 text-[10px] font-black uppercase tracking-wider hover:bg-blue-500 hover:text-white transition-all"
                 >
                   <Facebook size={14} /> Facebook
                 </a>
              </div>
              {chatMessages.map((m, i) => (
                <motion.div 
                  initial={{ opacity: 0, x: m.role === 'user' ? 10 : -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={i} 
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] p-4 rounded-2xl text-sm ${
                    m.role === 'user' 
                      ? 'bg-cyan text-black font-medium rounded-tr-none' 
                      : 'bg-bg3 border border-border text-white rounded-tl-none leading-relaxed'
                  }`}>
                    {m.content}
                  </div>
                </motion.div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-bg3 border border-border p-4 rounded-2xl rounded-tl-none flex gap-1">
                    <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-6 bg-bg3 border-t border-border">
              <div className="relative">
                <input 
                  id="chatInput"
                  type="text" 
                  placeholder="Pergunte sobre um tênis..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isTyping) {
                      const val = (e.target as HTMLInputElement).value;
                      handleSendMessage(val);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }}
                  className="w-full bg-bg border border-border rounded-2xl py-4 pl-6 pr-14 text-sm outline-none focus:border-cyan transition-all"
                />
                <button 
                  disabled={isTyping}
                  onClick={() => {
                    const input = document.getElementById('chatInput') as HTMLInputElement;
                    if (input && input.value.trim()) {
                      handleSendMessage(input.value);
                      input.value = '';
                    }
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-cyan text-black rounded-xl flex items-center justify-center shadow-lg active:scale-90 transition-all hover:bg-white disabled:opacity-50"
                >
                  <Send size={18} />
                </button>
              </div>
              <div className="mt-4 flex items-center justify-center gap-2 grayscale opacity-30 hover:grayscale-0 hover:opacity-100 transition-all cursor-default">
                  <Sparkles size={12} className="text-cyan" />
                  <span className="text-[10px] font-black uppercase tracking-widest">IA AI STUDIO POWERED</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-[1400px] mx-auto px-6 pt-10 border-t border-border flex flex-col md:flex-row justify-between items-center gap-6 text-[10px] text-muted uppercase tracking-[0.2em] font-bold">
          <span>© 2026 Mix Shoes. Todos os direitos reservados.</span>
          <button 
            onClick={() => setIsAdminMode(true)} 
            className="opacity-30 hover:opacity-100 transition-opacity"
          >
            Área Administrativa
          </button>
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
                    {selectedProduct.sizes.map(s => {
                      const isOutOfStock = (selectedProduct.sizeStock?.[s] || 0) <= 0;
                      return (
                        <button 
                          key={s}
                          disabled={isOutOfStock}
                          onClick={() => setSelectedSize(s)}
                          className={`w-14 h-14 rounded-2xl border-2 font-black transition-all ${
                            selectedSize === s 
                              ? 'bg-cyan/10 border-cyan text-cyan' 
                              : isOutOfStock 
                                ? 'bg-bg opacity-20 border-border cursor-not-allowed line-through' 
                                : 'bg-bg2 border-border hover:border-cyan/50'
                          }`}
                        >
                          {s}
                        </button>
                      );
                    })}
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

      <AnimatePresence>
        {isMenuOpen && (
          <div className="fixed inset-0 z-[500] flex justify-start">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="relative w-full max-w-[320px] bg-white text-black h-full shadow-2xl flex flex-col"
            >
               {/* Menu Header */}
               <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                 {menuLevel > 1 ? (
                   <button 
                     onClick={() => {
                       if(menuLevel === 3) setMenuLevel(2);
                       else setMenuLevel(1);
                     }}
                     className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                   >
                     <ChevronLeft size={24} className="text-[#0088cc]" />
                   </button>
                 ) : (
                   <div className="w-10" />
                 )}
                 <h2 className="font-bold text-[#0088cc] uppercase tracking-wider text-sm">
                   {menuLevel === 1 ? 'Menu' : (activeMenuId === 'products' ? 'Produtos' : activeMenuId?.toUpperCase())}
                 </h2>
                 <button onClick={() => { setIsMenuOpen(false); setMenuLevel(1); }} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400">
                   <X size={24} />
                 </button>
               </div>

               {/* Navigation Levels */}
               <div className="flex-1 border-t border-gray-100 flex flex-col overflow-hidden">
                 <AnimatePresence mode="wait">
                   <motion.div 
                     key={menuLevel + (activeSubMenuId || '')}
                     initial={{ x: 30, opacity: 0 }}
                     animate={{ x: 0, opacity: 1 }}
                     exit={{ x: -30, opacity: 0 }}
                     transition={{ duration: 0.2, ease: "easeOut" }}
                     className="flex-1 overflow-y-auto no-scrollbar"
                   >
                     {/* Level 1: Main Menu */}
                     {menuLevel === 1 && (
                       <div className="p-4">
                         <div className="relative mb-6">
                           <input 
                             type="text" 
                             placeholder="BUSCAR PRODUTOS..." 
                             className="w-full bg-gray-50 border border-gray-100 rounded-lg py-3 px-4 pr-10 text-xs font-bold uppercase tracking-wider outline-none focus:border-[#0088cc] transition-all"
                             value={searchQuery}
                             onChange={(e) => {
                               setSearchQuery(e.target.value);
                               if(e.target.value) {
                                 setIsMenuOpen(false);
                                 const catElement = document.getElementById('catalog');
                                 if(catElement) catElement.scrollIntoView({behavior: 'smooth'});
                               }
                             }}
                           />
                           <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
                         </div>
                         
                         <div className="space-y-1">
                           <button 
                             onClick={() => { setIsMenuOpen(false); setCurrentFilter('all'); setCurrentSection('all'); window.scrollTo({top: 0, behavior: 'smooth'}); }}
                             className="w-full text-left py-4 px-2 font-black text-gray-700 hover:text-[#0088cc] hover:bg-[#0088cc]/5 rounded-xl transition-all flex items-center justify-between text-sm uppercase tracking-widest"
                           >
                             Início
                           </button>
                           <button 
                             onClick={() => { setMenuLevel(2); setActiveMenuId('products'); }}
                             className="w-full text-left py-4 px-2 font-black text-gray-700 hover:text-[#0088cc] hover:bg-[#0088cc]/5 rounded-xl transition-all flex items-center justify-between text-sm uppercase tracking-widest group"
                           >
                             Produtos
                             <ChevronRight size={18} className="text-gray-300 group-hover:text-[#0088cc] transition-transform group-hover:translate-x-1" />
                           </button>
                           <button 
                             onClick={() => { setIsMenuOpen(false); const footer = document.querySelector('footer'); footer?.scrollIntoView({behavior: 'smooth'}); }}
                             className="w-full text-left py-4 px-2 font-black text-gray-700 hover:text-[#0088cc] hover:bg-[#0088cc]/5 rounded-xl transition-all flex items-center justify-between text-sm uppercase tracking-widest"
                           >
                             Contato
                           </button>
                         </div>
                       </div>
                     )}

                     {/* Level 2: Products Categories */}
                     {menuLevel === 2 && activeMenuId === 'products' && (
                       <div>
                          <button 
                            onClick={() => { setIsMenuOpen(false); setCurrentFilter('all'); setCurrentSection('all'); }}
                            className="w-full text-left p-6 border-b border-gray-50 text-[#0088cc] font-black text-xs uppercase tracking-widest hover:bg-[#0088cc]/5 transition-colors"
                          >
                            Ver todos os produtos
                          </button>
                          
                          {[
                            { id: 'masculino', label: 'MASCULINO R$:68,00', gender: 'Masculino', hasSub: true },
                            { id: 'feminino', label: 'FEMININO R$:68,00', gender: 'Feminino', hasSub: true },
                            { id: 'chuteira', label: 'CHUTEIRA R$:68,00', cat: 'Chuteira', hasSub: true },
                            { id: 'chinelo', label: 'CHINELO R$:68,00', cat: 'Chinelo', hasSub: true },
                            { id: 'camisa', label: 'CAMISA DE TIME', cat: 'Camisa de Time' },
                            { id: 'conjunto', label: 'CONJUNTO DRYFIT', cat: 'Conjunto Dryfit', hasSub: true },
                            { id: 'primeira-linha', label: 'PRIMEIRA LINHA', cat: 'Primeira Linha', hasSub: true },
                            { id: 'infantil', label: 'INFANTIL R$:68,00', cat: 'Infantil', hasSub: true }
                          ].map(item => (
                            <button 
                              key={item.id}
                              onClick={() => {
                                if(item.hasSub) {
                                  setMenuLevel(3);
                                  setActiveSubMenuId(item.id);
                                } else {
                                  setIsMenuOpen(false);
                                  if(item.cat) setCurrentFilter(item.cat);
                                  if(item.gender) { setCurrentSection(item.gender as any); setCurrentFilter('all'); }
                                }
                              }}
                              className="w-full text-left p-6 border-b border-gray-50 text-gray-700 hover:text-[#0088cc] hover:bg-[#0088cc]/5 font-black text-xs uppercase tracking-widest flex items-center justify-between transition-all group"
                            >
                              {item.label}
                              {item.hasSub && <ChevronRight size={18} className="text-gray-300 group-hover:text-[#0088cc] transition-transform group-hover:translate-x-1" />}
                            </button>
                          ))}
                       </div>
                     )}

                     {/* Level 3: Sub-categories / Options */}
                     {menuLevel === 3 && (
                       <div>
                          <button 
                            onClick={() => { 
                              setIsMenuOpen(false);
                              const parent = [
                                { id: 'masculino', gender: 'Masculino' },
                                { id: 'feminino', gender: 'Feminino' },
                                { id: 'chuteira', cat: 'Chuteira' },
                                { id: 'chinelo', cat: 'Chinelo' },
                                { id: 'conjunto', cat: 'Conjunto Dryfit' },
                                { id: 'primeira-linha', cat: 'Primeira Linha' },
                                { id: 'infantil', cat: 'Infantil' }
                              ].find(o => o.id === activeSubMenuId);
                              
                              if(parent?.gender) { setCurrentSection(parent.gender as any); setCurrentFilter('all'); }
                              if(parent?.cat) { setCurrentFilter(parent.cat); setCurrentSection('all'); }
                            }}
                            className="w-full text-left p-6 border-b border-gray-50 text-[#0088cc] font-black text-xs uppercase tracking-widest hover:bg-[#0088cc]/5 transition-colors"
                          >
                            Ver tudo em {activeSubMenuId?.replace('-', ' ')}
                          </button>

                          {['masculino', 'feminino', 'infantil', 'primeira-linha'].includes(activeSubMenuId!) && (
                             <div className="flex flex-col">
                               <button onClick={() => { setIsMenuOpen(false); setCurrentSection('Masculino'); }} className="w-full text-left p-6 border-b border-gray-50 text-gray-600 hover:text-[#0088cc] font-black text-xs uppercase tracking-widest transition-colors">Masculino</button>
                               <button onClick={() => { setIsMenuOpen(false); setCurrentSection('Feminino'); }} className="w-full text-left p-6 border-b border-gray-50 text-gray-600 hover:text-[#0088cc] font-black text-xs uppercase tracking-widest transition-colors">Feminino</button>
                             </div>
                          )}

                          {['chuteira', 'chinelo'].includes(activeSubMenuId!) && (
                             <div className="flex flex-col">
                               <button onClick={() => { setIsMenuOpen(false); setCurrentFilter(activeSubMenuId === 'chuteira' ? 'Chuteira' : 'Chinelo'); }} className="w-full text-left p-6 border-b border-gray-50 text-gray-600 hover:text-[#0088cc] font-black text-xs uppercase tracking-widest transition-colors">Numeração do 34 ao 39</button>
                               <button onClick={() => { setIsMenuOpen(false); setCurrentFilter(activeSubMenuId === 'chuteira' ? 'Chuteira' : 'Chinelo'); }} className="w-full text-left p-6 border-b border-gray-50 text-gray-600 hover:text-[#0088cc] font-black text-xs uppercase tracking-widest transition-colors">Numeração do 39 ao 43</button>
                             </div>
                          )}

                          {activeSubMenuId === 'conjunto' && (
                             <div className="flex flex-col">
                               <button onClick={() => { setIsMenuOpen(false); setCurrentFilter('Conjunto Dryfit'); }} className="w-full text-left p-6 border-b border-gray-50 text-gray-600 hover:text-[#0088cc] font-black text-xs uppercase tracking-widest transition-colors">M</button>
                               <button onClick={() => { setIsMenuOpen(false); setCurrentFilter('Conjunto Dryfit'); }} className="w-full text-left p-6 border-b border-gray-50 text-gray-600 hover:text-[#0088cc] font-black text-xs uppercase tracking-widest transition-colors">G</button>
                               <button onClick={() => { setIsMenuOpen(false); setCurrentFilter('Conjunto Dryfit'); }} className="w-full text-left p-6 border-b border-gray-50 text-gray-600 hover:text-[#0088cc] font-black text-xs uppercase tracking-widest transition-colors">GG</button>
                             </div>
                          )}
                       </div>
                     )}
                   </motion.div>
                 </AnimatePresence>
               </div>

               {/* Footer of Menu */}
               <div className="p-4 border-t border-gray-50 flex items-center justify-center gap-4 text-gray-400">
                <button 
                  onClick={() => { 
                    setIsMenuOpen(false); 
                    setIsAdminMode(true); 
                  }} 
                  className="flex items-center gap-2 text-xs hover:text-[#0088cc]"
                >
                  <UserIcon size={14} /> Iniciar sessão
                </button>
                 <span className="text-gray-200">|</span>
                 <button className="text-xs hover:text-[#0088cc]">Criar uma conta</button>
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
                    <div className="space-y-3">
                       <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-muted tracking-widest ml-1">Dados de Entrega</label>
                          <input id="finalName" type="text" placeholder="Nome Completo" className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-cyan" />
                          <input id="finalAddress" type="text" placeholder="Endereço Completo (Rua, Número, Bairro)" className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-cyan" />
                          <input id="finalPhone" type="tel" placeholder="Seu WhatsApp" className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-cyan" />
                       </div>

                       <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-muted tracking-widest ml-1">Cálculo de Frete</label>
                          <div className="flex gap-2">
                             <input 
                               type="text" 
                               placeholder="CEP: 00000-000" 
                               className="flex-1 bg-bg border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-cyan"
                               value={cep}
                               onChange={(e) => handleCEP(e.target.value)}
                               maxLength={9}
                             />
                          </div>
                          {shippingLoading && <div className="text-[10px] text-cyan animate-pulse ml-1">Calculando frete...</div>}
                          {shippingCost > 0 && (
                            <div className="flex items-center justify-between p-3 bg-cyan/5 border border-cyan/20 rounded-xl mt-2">
                              <div className="text-[10px] font-black">{shippingName} — {shippingPrazo}</div>
                              <div className="text-cyan font-bold text-xs">R$ {shippingCost.toFixed(2)}</div>
                            </div>
                          )}
                       </div>
                    </div>
                    <button 
                      onClick={() => {
                        const n = (document.getElementById('finalName') as HTMLInputElement).value;
                        const a = (document.getElementById('finalAddress') as HTMLInputElement).value;
                        const p = (document.getElementById('finalPhone') as HTMLInputElement).value;
                        finalizeOrder(n, p, a);
                      }}
                      className="w-full bg-green text-white py-5 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-all mt-4"
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
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div className="text-left">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted block ml-2 mb-2">Usuário</label>
                        <input id="admU" type="text" placeholder="mixshoes" className="w-full bg-bg3 border border-border rounded-2xl px-6 py-4 outline-none focus:border-cyan transition-all" />
                      </div>
                      <div className="text-left">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted block ml-2 mb-2">Senha</label>
                        <input id="admP" type="password" placeholder="••••••••" className="w-full bg-bg3 border border-border rounded-2xl px-6 py-4 outline-none focus:border-cyan transition-all" />
                      </div>
                    </div>

                    <button 
                      onClick={async () => {
                        const u = (document.getElementById('admU') as HTMLInputElement).value;
                        const p = (document.getElementById('admP') as HTMLInputElement).value;
                        
                        if(!u || !p) { showToast('⚠️ Digite usuário e senha'); return; }
                        
                        // Map requested credentials to Firebase Auth email
                        // username 'mixshoes' -> 'admin@mixshoes.com'
                        const email = u === 'mixshoes' ? 'admin@mixshoes.com' : `${u}@mixshoes.com`;
                        
                        showToast('🔐 Autenticando...');
                        try {
                          await signInWithEmailAndPassword(auth, email, p);
                          setAdminPanelOpen(true);
                          showToast('✅ Acesso Liberado!');
                        } catch(err: any) {
                          console.error("Firebase Auth Error:", err.code);
                          
                          if (err.code === 'auth/operation-not-allowed') {
                            showToast('🚀 Ative "E-mail/Senha" no Console Firebase!');
                          } else if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
                            // First time setup attempt if credentials match requested
                            if (u === 'mixshoes' && p === 'adminmixshoes') {
                              showToast('🔄 Criando conta admin inicial...');
                              try {
                                await createUserWithEmailAndPassword(auth, email, p);
                                setAdminPanelOpen(true);
                                showToast('✅ Conta Criada e Autenticada!');
                              } catch(ce: any) {
                                showToast('❌ Erro na criação: ' + ce.code);
                              }
                            } else {
                              showToast('❌ Usuário ou senha incorretos');
                            }
                          } else {
                            showToast('❌ Erro: ' + err.code);
                          }
                        }
                      }}
                      className="w-full bg-cyan text-black py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-cyan/20 active:scale-95 transition-all"
                    >
                      Acessar Painel
                    </button>
                    
                    <button onClick={() => setIsAdminMode(false)} className="text-muted text-xs underline mt-4 block mx-auto">Voltar para Loja</button>
                  </div>
               </motion.div>
             ) : (
               <motion.div className="w-full flex flex-col max-w-7xl mx-auto">
                 <div className="flex items-center justify-between py-6 border-b border-border mb-10">
                    <div className="font-bebas text-4xl">PAINEL <span className="text-cyan">MIX SHOES</span></div>
                   <div className="flex items-center gap-4">
                     <span className="text-[10px] text-green font-black uppercase tracking-widest">🔥 ONLINE</span>
                      <button 
                       onClick={async () => {
                         await signOut(auth);
                         setAdminPanelOpen(false); 
                         setIsAdminMode(false); 
                       }} 
                       className="bg-bg3 border border-border px-6 py-3 rounded-full text-xs font-bold hover:bg-white/5 transition-all"
                     >
                       Sair
                     </button>
                   </div>
                 </div>

                 <div className="flex gap-2 overflow-x-auto no-scrollbar mb-10 bg-bg2 p-1.5 rounded-3xl border border-border w-fit">
                    {[
                      {id: 'dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard'},
                      {id: 'products', icon: <Package size={18} />, label: 'Produtos'},
                      {id: 'inventory', icon: <Database size={18} />, label: 'Inventário'},
                      {id: 'cat-mgmt', icon: <Layers size={18} />, label: 'Categorias'},
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

                   {activeAdminTab === 'inventory' && (
                     <div className="space-y-6 animate-in fade-in duration-500">
                        <div className="bg-bg3 border border-border p-8 rounded-[2rem] flex flex-col md:flex-row md:items-center justify-between gap-6">
                           <div>
                              <h2 className="font-bebas text-3xl mb-1 italic text-cyan">📦 CONTROLE DE INVENTÁRIO</h2>
                              <p className="text-muted text-[10px] font-black uppercase tracking-widest">Ajuste rápido de estoque por numeração</p>
                           </div>
                           <button 
                               onClick={syncGlobalSizes}
                               className="bg-bg border border-border px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-cyan hover:bg-cyan hover:text-black transition-all flex items-center gap-2 group"
                           >
                               <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-500" />
                               Aplicar Grade 34-43 em Todos
                           </button>
                        </div>
                        <div className="bg-bg3 border border-border rounded-[2.5rem] overflow-hidden">
                           <table className="w-full text-left">
                              <thead className="bg-bg2 border-b border-border">
                                 <tr className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">
                                    <th className="p-8">Produto (Referência)</th>
                                    <th className="p-8">Variações</th>
                                    <th className="p-8 text-center">Ações Rápidas</th>
                                 </tr>
                              </thead>
                              <tbody className="divide-y divide-border/30">
                                 {products.map(p => (
                                   <tr key={p.id} className="hover:bg-cyan/[0.02] transition-colors group">
                                      <td className="p-8 w-[400px]">
                                         <div className="flex items-center gap-6">
                                            <img src={p.img} referrerPolicy="no-referrer" className="w-16 h-16 rounded-2xl object-cover border border-border shadow-inner" />
                                            <div className="min-w-0">
                                               <div className="font-black text-base truncate mb-1 text-white uppercase">{p.name}</div>
                                               <div className="text-[10px] text-muted font-black uppercase tracking-widest">{p.cat} | Total {p.stock}</div>
                                            </div>
                                         </div>
                                      </td>
                                      <td className="p-8">
                                         <div className="flex flex-wrap gap-4 text-white font-bold">
                                            {p.sizes.map(size => (
                                               <div key={size} className="flex items-center gap-2">
                                                  <span className="text-[10px] font-black text-muted tracking-widest uppercase">{size}:</span>
                                                  <input type="number" id={`iv2-${p.id}-${size}`} defaultValue={p.sizeStock?.[size] || 0} className="w-16 bg-bg border border-border rounded-xl px-2 py-1.5 text-xs text-center focus:border-cyan outline-none" />
                                               </div>
                                            ))}
                                         </div>
                                      </td>
                                      <td className="p-8 text-center">
                                         <button 
                                           onClick={async () => {
                                             const updatedSS = { ...(p.sizeStock || {}) };
                                             p.sizes.forEach(sz => {
                                               const inp = document.getElementById(`iv2-${p.id}-${sz}`) as HTMLInputElement;
                                               if(inp) updatedSS[sz] = Number(inp.value);
                                             });
                                             const tot = Object.values(updatedSS).reduce((ac: number, cur: any) => ac + (Number(cur) || 0), 0);
                                             showToast('💾 Sincronizando...');
                                             try {
                                               await setDoc(doc(db, 'products', p.id), { ...p, sizeStock: updatedSS, stock: tot });
                                               showToast('✅ Inventário Atualizado!');
                                             } catch(e) { handleFirestoreError(e, OperationType.UPDATE, `inv/${p.id}`); }
                                           }}
                                           className="bg-cyan text-black px-6 py-2 rounded-xl font-black text-[10px] uppercase shadow-lg shadow-cyan/10 hover:brightness-110 active:scale-95 transition-all"
                                         >
                                           Salvar Item
                                         </button>
                                      </td>
                                   </tr>
                                 ))}
                              </tbody>
                           </table>
                        </div>
                     </div>
                   )}

                   {activeAdminTab === 'cat-mgmt' && (
                      <div className="space-y-10 animate-in fade-in duration-500">
                         <div className="bg-bg3 border border-border p-10 rounded-[2.5rem]">
                            <h2 className="font-bebas text-5xl mb-2 text-white italic tracking-wider uppercase">🏷️ DEPARTAMENTOS</h2>
                            <p className="text-muted text-[10px] font-black uppercase tracking-[0.2em] ml-1">Gerencie os departamentos da sua vitrina</p>
                         </div>
                         <div className="grid lg:grid-cols-3 gap-6">
                            {CATEGORIES.map(cat => (
                               <div key={cat} className="bg-bg3 border border-border p-10 rounded-[3rem] flex flex-col justify-between hover:border-cyan transition-all cursor-pointer shadow-lg group">
                                  <div className="flex items-center gap-6 mb-8 relative z-10">
                                     <div className="w-16 h-16 bg-bg border border-border rounded-[1.5rem] flex items-center justify-center text-cyan group-hover:bg-cyan group-hover:text-black transition-all text-2xl shadow-inner"><Layers size={24} /></div>
                                     <div>
                                        <div className="font-bebas text-3xl uppercase tracking-wider text-white">{cat}</div>
                                        <div className="text-[10px] text-muted font-black uppercase tracking-widest">{products.filter(p => p.cat === cat).length} Produtos</div>
                                     </div>
                                  </div>
                                  <div className="flex gap-2 relative z-10">
                                     <button className="flex-1 py-4 bg-bg2 border border-border rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-muted hover:text-white transition-all">Editar</button>
                                     <button className="p-4 bg-bg2 border border-border rounded-2xl text-red hover:bg-red hover:text-white transition-all"><Trash2 size={20} /></button>
                                  </div>
                               </div>
                            ))}
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
                                          onClick={() => openProductModal(p)}
                                          className="p-2.5 bg-bg border border-border rounded-xl text-muted hover:text-cyan transition-all"
                                       >
                                          <Settings size={14} />
                                       </button>
                                       <button 
                                          onClick={async () => {
                                             if(confirm('🗑 Excluir este produto permanentemente?')) {
                                               try {
                                                 await deleteDoc(doc(db, 'products', p.id));
                                                 showToast('✅ Produto excluído');
                                               } catch(e) {
                                                  handleFirestoreError(e, OperationType.DELETE, `products/${p.id}`);
                                               }
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
                                            try {
                                              await setDoc(doc(db, 'orders', o.id), { ...o, status: e.target.value });
                                              showToast('✅ Status atualizado');
                                            } catch(err) {
                                              handleFirestoreError(err, OperationType.UPDATE, `orders/${o.id}`);
                                            }
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
                                             try {
                                               await deleteDoc(doc(db, 'orders', o.id));
                                               showToast('🗑 Pedido removido');
                                             } catch(err) {
                                               handleFirestoreError(err, OperationType.DELETE, `orders/${o.id}`);
                                             }
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
                                                if(!auth.currentUser) {
                                                    showToast('⚠️ Entre com Google para salvar');
                                                    return;
                                                }
                                                // Real PDV logic: update stock in firebase
                                                showToast('📦 Atualizando estoque...');
                                                try {
                                                    for (const item of cart) {
                                                        const p = products.find(prod => prod.id === item.produtoId);
                                                        if (p) {
                                                            const newSizeStock = { ...(p.sizeStock || {}) };
                                                            const currentSizeStock = newSizeStock[item.tamanho] || 0;
                                                            newSizeStock[item.tamanho] = Math.max(0, currentSizeStock - item.quantidade);
                                                            const totalStock = Object.values(newSizeStock).reduce((acc: number, curr: any) => acc + (Number(curr) || 0), 0);

                                                            await setDoc(doc(db, 'products', p.id), {
                                                                ...p,
                                                                stock: totalStock,
                                                                sizeStock: newSizeStock,
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
                                                } catch(e) { handleFirestoreError(e, OperationType.UPDATE, 'pdv/venda'); }
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
                                                onClick={async () => {
                                                  try {
                                                    await setDoc(doc(db, 'products', p.id), { ...p, stock: p.stock + 1 });
                                                  } catch(e) {
                                                    handleFirestoreError(e, OperationType.UPDATE, `products/${p.id}`);
                                                  }
                                                }}
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
                                    if(!auth.currentUser) {
                                        showToast('⚠️ Entre com Google para salvar');
                                        return;
                                    }
                                    showToast('💾 Gravando no Firebase...');
                                    try {
                                        await setDoc(doc(db, 'config', 'main'), config);
                                        showToast('✅ Configurações Salvas!');
                                    } catch(e) { 
                                        handleFirestoreError(e, OperationType.UPDATE, 'config/main');
                                    }
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
                   <label className="text-[10px] font-black uppercase tracking-widest text-muted block ml-2 mb-2">Seção / Gênero</label>
                   <select id="pGender" defaultValue={editingProduct?.gender || 'Masculino'} className="w-full bg-bg3 border border-border rounded-2xl px-6 py-4 outline-none focus:border-cyan appearance-none">
                      {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                   </select>
                 </div>
                 <div>
                   <label className="text-[10px] font-black uppercase tracking-widest text-muted block ml-2 mb-2">Categoria</label>
                   <select id="pCat" defaultValue={editingProduct?.cat || 'Tênis'} className="w-full bg-bg3 border border-border rounded-2xl px-6 py-4 outline-none focus:border-cyan appearance-none">
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                   </select>
                 </div>
                 <div>
                   <label className="text-[10px] font-black uppercase tracking-widest text-muted block ml-2 mb-2">Grade (Sub-Cat)</label>
                   <select id="pSubCat" defaultValue={editingProduct?.subCat || 'Nenhuma'} className="w-full bg-bg3 border border-border rounded-2xl px-6 py-4 outline-none focus:border-cyan appearance-none">
                      {SUB_CATEGORIES.map(s => <option key={s} value={s}>{s}</option>)}
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
                 <div className="sm:col-span-2">
                   <label className="text-[10px] font-black uppercase tracking-widest text-muted block ml-2 mb-2">Tamanhos e Estoque Individual</label>
                   <div className="bg-bg3 border border-border rounded-2xl p-6 space-y-4">
                      <div className="flex gap-2 mb-4">
                         <input 
                           type="text" 
                           id="newSize"
                           placeholder="Adicionar tamanho (ex: 44)" 
                           className="flex-1 bg-bg border border-border rounded-xl px-4 py-2 outline-none focus:border-cyan text-sm"
                           onKeyDown={(e) => {
                             if(e.key === 'Enter') {
                               const val = (e.target as HTMLInputElement).value.trim();
                               if(val && !modalSizes.includes(val)) {
                                 setModalSizes([...modalSizes, val]);
                                 (e.target as HTMLInputElement).value = '';
                               }
                             }
                           }}
                         />
                         <button 
                           type="button"
                           onClick={() => {
                             const input = document.getElementById('newSize') as HTMLInputElement;
                             const val = input.value.trim();
                             if(val && !modalSizes.includes(val)) {
                               setModalSizes([...modalSizes, val]);
                               input.value = '';
                             }
                           }}
                           className="bg-cyan text-black px-4 py-2 rounded-xl font-bold text-xs"
                         >
                           +
                         </button>
                      </div>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                         {modalSizes.map(size => (
                           <div key={size} className="bg-bg rounded-2xl border border-border p-3 flex flex-col gap-2">
                              <div className="flex justify-between items-center">
                                 <span className="text-xs font-black text-cyan">TAM: {size}</span>
                                 <button 
                                   type="button"
                                   onClick={() => {
                                     setModalSizes(modalSizes.filter(s => s !== size));
                                     const newStock = {...modalSizeStock};
                                     delete newStock[size];
                                     setModalSizeStock(newStock);
                                   }}
                                   className="text-red hover:bg-red/10 p-1 rounded"
                                 >
                                   <X size={12} />
                                 </button>
                              </div>
                              <input 
                                type="number"
                                placeholder="Qtd"
                                value={modalSizeStock[size] || 0}
                                onChange={(e) => {
                                  setModalSizeStock({
                                    ...modalSizeStock,
                                    [size]: Number(e.target.value)
                                  });
                                }}
                                className="w-full bg-bg3 border border-border rounded-lg px-3 py-2 outline-none focus:border-cyan text-xs"
                              />
                           </div>
                         ))}
                      </div>
                   </div>
                 </div>
                 <div className="sm:col-span-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted block ml-2 mb-2">Descrição</label>
                    <textarea id="pDesc" rows={3} defaultValue={editingProduct?.desc || ''} className="w-full bg-bg3 border border-border rounded-2xl px-6 py-4 outline-none focus:border-cyan"></textarea>
                 </div>
              </div>
              <button 
                onClick={async () => {
                   if(!auth.currentUser) {
                      showToast('⚠️ Entre com Google para salvar no Firebase');
                      return;
                   }
                   const totalStock = Object.values(modalSizeStock).reduce((acc: number, curr: any) => acc + (Number(curr) || 0), 0);
                   const data = {
                      name: (document.getElementById('pName') as HTMLInputElement).value,
                      gender: (document.getElementById('pGender') as HTMLSelectElement).value,
                      cat: (document.getElementById('pCat') as HTMLSelectElement).value,
                      subCat: (document.getElementById('pSubCat') as HTMLSelectElement).value,
                      price: Number((document.getElementById('pPrice') as HTMLInputElement).value),
                      img: (document.getElementById('pImg') as HTMLInputElement).value,
                      stock: totalStock,
                      sizeStock: modalSizeStock,
                      sizes: modalSizes,
                      desc: (document.getElementById('pDesc') as HTMLTextAreaElement).value,
                      priceOld: 0,
                      vendas: editingProduct?.vendas || 0,
                      novo: editingProduct?.novo ?? true,
                      createdAt: editingProduct?.createdAt || Date.now()
                   };
                   
                   // Some categories might have different prices, let's allow setting it if we add the input back,
                   // but for now the user mentioned 68,00 is the standard for these sections.
                   // Wait, I should probably keep the price input just in case.
                   
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
                   } catch(e) { 
                     handleFirestoreError(e, editingProduct ? OperationType.UPDATE : OperationType.CREATE, 'products');
                   }
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
                      <div className="max-h-80 overflow-y-auto p-4 space-y-4">
                         {viewingOrder.itens.map(i => (
                           <div key={i._key} className="flex justify-between items-center bg-bg/20 p-3 rounded-2xl border border-border/50">
                             <div className="flex items-center gap-4">
                               <div className="w-14 h-14 bg-bg rounded-xl overflow-hidden border border-border shrink-0">
                                 {i.imagem ? <img src={i.imagem} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xl">👟</div>}
                               </div>
                               <div>
                                 <div className="font-bold text-sm leading-tight mb-1">{i.nome}</div>
                                 <div className="text-[10px] text-muted font-black uppercase tracking-widest flex items-center gap-2">
                                     <span>TAM: {i.tamanho}</span>
                                     <span className="w-1 h-1 bg-border rounded-full" />
                                     <span>QTD: {i.quantidade}</span>
                                 </div>
                               </div>
                             </div>
                             <div className="font-bebas text-xl text-orange whitespace-nowrap">R$ {(i.preco * i.quantidade).toFixed(2)}</div>
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
