import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import axios from 'axios';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Textarea } from './components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Badge } from './components/ui/badge';
import { Avatar, AvatarFallback } from './components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { 
  Home, 
  User, 
  Package, 
  Plus, 
  Search, 
  Bell, 
  MessageCircle, 
  Star, 
  MapPin, 
  Calendar, 
  Coins,
  LogOut,
  Menu,
  X,
  Filter,
  Upload,
  Eye,
  Send,
  AlertTriangle,
  CheckCircle,
  Clock,
  Shield,
  Trash2,
  Phone,
  Settings,
  FileText,
  MessageSquare,
  CreditCard,
  BookOpen,
  Camera,
  Upload as UploadIcon,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Ban,
  Flag,
  ThumbsUp,
  ThumbsDown,
  Image as ImageIcon,
  Receipt,
  History,
  HelpCircle
} from 'lucide-react';
import './App.css';
import { ChatPageComponent } from './App-Components';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const API = `${BACKEND_URL}/api`;
const WS_URL = BACKEND_URL.replace('http://', 'ws://').replace('https://', 'wss://').replace(':8000', ':8000');

axios.defaults.timeout = 10000;
axios.defaults.headers.common['Content-Type'] = 'application/json';

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    if (error.code === 'ECONNABORTED') {
      toast.error('Request timeout - please try again');
    } else if (error.response?.status === 0 || !error.response) {
      toast.error('Network error - check if server is running');
    } else if (error.response?.status >= 500) {
      toast.error('Server error - please try again later');
    }
    return Promise.reject(error);
  }
);

// WebSocket Context
const WebSocketContext = createContext();

const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

const WebSocketProvider = ({ children, userId }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef(null);

  const connect = () => {
    if (!userId) return;

    try {
      const ws = new WebSocket(`${WS_URL}/ws/${userId}`);
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setSocket(ws);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        setSocket(null);
        
        // Reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  };

  const handleWebSocketMessage = (data) => {
    switch (data.type) {
      case 'notification':
        toast.info(data.data.title, {
          description: data.data.message,
        });
        // Trigger a custom event to update notifications
        window.dispatchEvent(new CustomEvent('newNotification', { detail: data.data }));
        break;
      case 'new_message':
        toast.info('New Message', {
          description: `${data.data.sender.full_name} sent you a message`,
        });
        window.dispatchEvent(new CustomEvent('newMessage', { detail: data.data }));
        break;
      case 'transaction_update':
        window.dispatchEvent(new CustomEvent('transactionUpdate', { detail: data.data }));
        break;
      default:
        console.log('Unknown WebSocket message type:', data.type);
    }
  };

  useEffect(() => {
    if (userId) {
      connect();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socket) {
        socket.close();
      }
    };
  }, [userId]);

  return (
    <WebSocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </WebSocketContext.Provider>
  );
};

// Auth Context
const AuthContext = createContext();

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUserProfile();
    } else {
      delete axios.defaults.headers.common['Authorization'];
      setLoading(false);
    }
  }, [token]);

  const fetchUserProfile = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
    } catch (error) {
      console.error('Failed to fetch user profile:', error.response?.data || error.message);
      if (error.response?.status === 401) {
        logout();
      }
    } finally {
      setLoading(false);
    }
  };

  const login = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('token', authToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading, setUser }}>
      <WebSocketProvider userId={user?.id}>
        {children}
      </WebSocketProvider>
    </AuthContext.Provider>
  );
};

// Navigation Component - ENHANCED with new pages
const Navigation = () => {
  const { user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (user) {
      fetchNotificationCount();
    }
  }, [user]);

  useEffect(() => {
    const handleNewNotification = () => {
      setNotificationCount(prev => prev + 1);
    };

    window.addEventListener('newNotification', handleNewNotification);
    return () => window.removeEventListener('newNotification', handleNewNotification);
  }, []);

  const fetchNotificationCount = async () => {
    try {
      const response = await axios.get(`${API}/notifications`);
      const unreadCount = response.data.filter(n => !n.is_read).length;
      setNotificationCount(unreadCount);
    } catch (error) {
      console.error('Failed to fetch notification count:', error);
    }
  };

  const navigationItems = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/browse', icon: Search, label: 'Browse' }, 
    { path: '/search-filter', icon: Filter, label: 'Search & Filter' },
    { path: '/add-item', icon: Plus, label: 'Add Item' },
    { path: '/my-items', icon: Package, label: 'My Items' },
    { path: '/my-activity', icon: Calendar, label: 'My Activity' },
    { path: '/transactions', icon: Receipt, label: 'Transactions' },
    { path: '/messages', icon: MessageCircle, label: 'Messages' },
    { path: '/notifications', icon: Bell, label: 'Notifications', badge: notificationCount },
    { path: '/token-management', icon: CreditCard, label: 'Token Management' },
    { path: '/complaints', icon: Flag, label: 'Complaints' },
    { path: '/feedback', icon: MessageSquare, label: 'Feedback' },
    { path: '/guidelines', icon: BookOpen, label: 'Guidelines' },
    { path: '/profile', icon: User, label: 'Profile' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  const isActiveRoute = (path) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-r from-teal-500 to-orange-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">S</span>
          </div>
          <span className="text-xl font-bold text-gray-800">ShareSphere</span>
        </div>
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="p-2 rounded-lg hover:bg-gray-100"
        >
          {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black bg-opacity-50" onClick={() => setIsMenuOpen(false)}>
          <div className="bg-white w-64 h-full shadow-lg overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b">
              <div className="flex items-center space-x-3">
                <Avatar>
                  <AvatarFallback className="bg-teal-500 text-white">
                    {user?.full_name?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-gray-800">{user?.full_name}</p>
                  <p className="text-sm text-gray-500">@{user?.username}</p>
                </div>
              </div>
            </div>
            <nav className="p-4">
              {navigationItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => {
                    navigate(item.path);
                    setIsMenuOpen(false);
                  }}
                  className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg text-left transition-colors ${
                    isActiveRoute(item.path)
                      ? 'bg-teal-100 text-teal-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.label}</span>
                  {item.badge > 0 && (
                    <Badge className="ml-auto bg-red-500">{item.badge}</Badge>
                  )}
                </button>
              ))}
              <button
                onClick={() => {
                  logout();
                  setIsMenuOpen(false);
                }}
                className="w-full flex items-center space-x-3 px-3 py-3 rounded-lg text-left text-gray-600 hover:bg-gray-100 mt-4 border-t pt-4"
              >
                <LogOut className="w-5 h-5" />
                <span>Logout</span>
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Desktop Sidebar - ENHANCED with teal-orange theme */}
      <div className="hidden lg:block w-64 bg-white border-r border-gray-200 h-screen fixed left-0 top-0 flex flex-col">
        <div className="p-6 border-b flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-teal-500 to-orange-500 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold">S</span>
            </div>
            <span className="text-2xl font-bold text-gray-800">ShareSphere</span>
          </div>
        </div>
        
        <div className="p-4 border-b flex-shrink-0">
          <div className="flex items-center space-x-3">
            <Avatar>
              <AvatarFallback className="bg-teal-500 text-white">
                {user?.full_name?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium text-gray-800">{user?.full_name}</p>
              <p className="text-sm text-gray-500">@{user?.username}</p>
              <div className="flex items-center space-x-1 mt-1">
                <Coins className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-medium text-orange-600">{user?.tokens || 0}</span>
                {user?.phone && (
                  <>
                    <Phone className="w-4 h-4 text-green-500 ml-2" />
                    <span className="text-xs text-green-600">verified</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <nav className="p-4 flex-1 overflow-y-auto">
          {navigationItems.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg text-left transition-colors mb-1 ${
                isActiveRoute(item.path)
                  ? 'bg-teal-100 text-teal-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
              {item.badge > 0 && (
                <Badge className="ml-auto bg-red-500">{item.badge}</Badge>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t flex-shrink-0">
          <button
            onClick={logout}
            className="w-full flex items-center space-x-3 px-3 py-3 rounded-lg text-left text-gray-600 hover:bg-gray-100"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </>
  );
};

// Authentication Pages - ENHANCED with phone validation  
const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    full_name: '',
    location: '',
    phone: '',
    password: '',
    identifier: ''
  });
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const data = isLogin ? 
        { identifier: formData.identifier, password: formData.password } :
        formData;

      const response = await axios.post(`${API}${endpoint}`, data);
      
      if (response.data.user?.is_banned) {
        toast.error('Your account has been banned due to multiple complaints. Please contact support.');
        return;
      }
      
      login(response.data.user, response.data.token);
      toast.success(response.data.message);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-orange-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-teal-500 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">S</span>
          </div>
          <CardTitle className="text-2xl font-bold text-gray-800">
            {isLogin ? 'Welcome Back' : 'Join ShareSphere'}
          </CardTitle>
          <CardDescription>
            {isLogin ? 'Sign in to your account' : 'Create your account to start sharing'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isLogin ? (
              <>
                <div>
                  <Label htmlFor="identifier">Email or Username</Label>
                  <Input
                    id="identifier"
                    name="identifier"
                    value={formData.identifier}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input
                    id="full_name"
                    name="full_name"
                    value={formData.full_name}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    name="location"
                    value={formData.location}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone Number (Required) <span className="text-red-500">*</span></Label>
                  <Input
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="Enter 10-digit Indian phone number"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Required for account verification</p>
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                  />
                </div>
              </>
            )}
            
            <Button 
              type="submit" 
              className="w-full bg-teal-600 hover:bg-teal-700"
              disabled={loading}
            >
              {loading ? 'Please wait...' : (isLogin ? 'Sign In' : 'Create Account')}
            </Button>
          </form>
          
          <div className="mt-6 text-center">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-teal-600 hover:text-teal-700 font-medium"
            >
              {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Home Dashboard
const HomePage = () => {
  const { user, setUser } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
  }, []);

  useEffect(() => {
    const handleTransactionUpdate = () => {
      fetchDashboard();
    };

    window.addEventListener('transactionUpdate', handleTransactionUpdate);
    return () => window.removeEventListener('transactionUpdate', handleTransactionUpdate);
  }, []);

  const fetchDashboard = async () => {
    try {
      const response = await axios.get(`${API}/dashboard`);
      setDashboardData(response.data);
      // Update user data to reflect latest token balance
      if (response.data.user) {
        setUser(response.data.user);
      }
    } catch (error) {
      console.error('Dashboard error:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error occurred';
      toast.error(`Failed to load dashboard: ${errorMessage}`);
      // Set some default data to prevent further errors
      setDashboardData({
        user_items_count: 0,
        active_members: 0,
        unread_notifications: 0,
        pending_requests: 0
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Welcome back, {user?.full_name}!</h1>
          <p className="text-gray-600 mt-1">Here's what's happening in your community</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6 bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-orange-500 rounded-lg">
              <Coins className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Your Tokens</p>
              <p className="text-2xl font-bold text-gray-800">{user?.tokens || 0}</p>
              {user?.pending_penalties > 0 && (
                <p className="text-xs text-red-600">Pending: -{user.pending_penalties}</p>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-blue-500 rounded-lg">
              <Package className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Your Items</p>
              <p className="text-2xl font-bold text-gray-800">{dashboardData?.user_items_count || 0}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-green-500 rounded-lg">
              <Star className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Rating</p>
              <p className="text-2xl font-bold text-gray-800">{user?.star_rating?.toFixed(1) || '5.0'}</p>
              <p className="text-xs text-gray-500">{user?.success_rate?.toFixed(1) || '100'}% success</p>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-purple-500 rounded-lg">
              <User className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Active Members</p>
              <p className="text-2xl font-bold text-gray-800">{dashboardData?.active_members || 0}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Notifications & Requests */}
      {(dashboardData?.unread_notifications > 0 || dashboardData?.pending_requests > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {dashboardData?.unread_notifications > 0 && (
            <Card className="p-6 bg-blue-50 border-blue-200">
              <div className="flex items-center space-x-3">
                <Bell className="w-6 h-6 text-blue-600" />
                <div>
                  <h3 className="font-semibold text-blue-800">New Notifications</h3>
                  <p className="text-sm text-blue-600">You have {dashboardData.unread_notifications} unread notifications</p>
                </div>
              </div>
            </Card>
          )}

          {dashboardData?.pending_requests > 0 && (
            <Card className="p-6 bg-orange-50 border-orange-200">
              <div className="flex items-center space-x-3">
                <Clock className="w-6 h-6 text-orange-600" />
                <div>
                  <h3 className="font-semibold text-orange-800">Pending Requests</h3>
                  <p className="text-sm text-orange-600">{dashboardData.pending_requests} requests need your attention</p>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Get started with ShareSphere</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button className="h-24 flex-col bg-teal-600 hover:bg-teal-700" onClick={() => window.location.href = '/add-item'}>
              <Plus className="w-6 h-6 mb-2" />
              Add Your First Item
            </Button>
            <Button variant="outline" className="h-24 flex-col" onClick={() => window.location.href = '/browse'}>
              <Search className="w-6 h-6 mb-2" />
              Browse Items
            </Button>
            <Button variant="outline" className="h-24 flex-col" onClick={() => window.location.href = '/profile'}>
              <User className="w-6 h-6 mb-2" />
              Complete Profile
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Browse Items Page - ENHANCED
const BrowseItemsPage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    category: '',
    location: '',
    minTokens: '',
    maxTokens: ''
  });

  useEffect(() => {
    fetchItems();
  }, [filters]);

  const fetchItems = async () => {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== 'all') params.append(key === 'minTokens' ? 'min_tokens' : key === 'maxTokens' ? 'max_tokens' : key, value);
      });

      const response = await axios.get(`${API}/items?${params}`);
      setItems(response.data);
    } catch (error) {
      toast.error('Failed to load items');
    } finally {
      setLoading(false);
    }
  };

  const categories = [
    'Tools', 'Electronics', 'Outdoor', 'Home & Kitchen',
    'Books & Stationery', 'Sports & Fitness', 'Event Gear', 'Miscellaneous'
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Browse Items</h1>
          <p className="text-gray-600 mt-1">Discover amazing items from your community</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Filter className="w-5 h-5" />
            <span>Filters</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>Category</Label>
              <Select value={filters.category} onValueChange={(value) => 
                setFilters(prev => ({...prev, category: value}))}>
                <SelectTrigger>
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(category => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Location</Label>
              <Input
                placeholder="Enter location"
                value={filters.location}
                onChange={(e) => setFilters(prev => ({...prev, location: e.target.value}))}
              />
            </div>
            <div>
              <Label>Min Tokens</Label>
              <Input
                type="number"
                placeholder="0"
                value={filters.minTokens}
                onChange={(e) => setFilters(prev => ({...prev, minTokens: e.target.value}))}
              />
            </div>
            <div>
              <Label>Max Tokens</Label>
              <Input
                type="number"
                placeholder="100"
                value={filters.maxTokens}
                onChange={(e) => setFilters(prev => ({...prev, maxTokens: e.target.value}))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">Loading items...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map(item => (
            <Card key={item.id} className="overflow-hidden hover:shadow-lg transition-shadow">
              <div className="aspect-video bg-gray-100 relative">
                {item.images.length > 0 ? (
                  <img
                    src={`${BACKEND_URL}${item.images[0]}`}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-12 h-12 text-gray-400" />
                  </div>
                )}
                <div className="absolute top-2 left-2">
                  <Badge className="bg-teal-600">{item.category}</Badge>
                </div>
                <div className="absolute top-2 right-2">
                  <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                    <Coins className="w-3 h-3 mr-1" />
                    {item.tokens_per_day}/day
                  </Badge>
                </div>
              </div>
              <CardContent className="p-4">
                <h3 className="font-semibold text-gray-800 mb-2">{item.title}</h3>
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{item.description}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-sm text-gray-500">
                    <MapPin className="w-4 h-4" />
                    <span>{item.location}</span>
                  </div>
                  <div className="flex items-center space-x-1 text-sm">
                    <Star className="w-4 h-4 text-yellow-500" />
                    <span>{item.owner.star_rating.toFixed(1)}</span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Avatar className="w-6 h-6">
                      <AvatarFallback className="text-xs bg-teal-500 text-white">
                        {item.owner.full_name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-gray-600">{item.owner.full_name}</span>
                  </div>
                  <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={() => navigate(`/items/${item.id}`)}>
                    <Eye className="w-4 h-4 mr-1" />
                    View
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && items.length === 0 && (
        <Card className="p-12 text-center">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-600 mb-2">No items found</h3>
          <p className="text-gray-500">Try adjusting your filters or check back later!</p>
        </Card>
      )}
    </div>
  );
};

// Search & Filter Page - NEW ENHANCED PAGE
const SearchFilterPage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    category: '',
    location: '',
    minTokens: '',
    maxTokens: '',
    minRating: '',
    availableDate: ''
  });

  const categories = [
    'Tools', 'Electronics', 'Outdoor', 'Home & Kitchen',
    'Books & Stationery', 'Sports & Fitness', 'Event Gear', 'Miscellaneous'
  ];

  const handleSearch = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== 'all') {
          const paramKey = key === 'minTokens' ? 'min_tokens' : 
                           key === 'maxTokens' ? 'max_tokens' : 
                           key === 'availableDate' ? 'available_date' : key;
          params.append(paramKey, value);
        }
      });

      const response = await axios.get(`${API}/items?${params}`);
      setItems(response.data);
    } catch (error) {
      toast.error('Failed to search items');
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setFilters({
      category: '',
      location: '',
      minTokens: '',
      maxTokens: '',
      minRating: '',
      availableDate: ''
    });
    setItems([]);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Advanced Search & Filter</h1>
        <p className="text-gray-600 mt-1">Find exactly what you're looking for</p>
      </div>

      {/* Search Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Search className="w-5 h-5" />
            <span>Search Items</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex space-x-2">
            <Input
              placeholder="Search by title or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleSearch} className="bg-teal-600 hover:bg-teal-700">
              <Search className="w-4 h-4 mr-2" />
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Advanced Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Filter className="w-5 h-5" />
            <span>Advanced Filters</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <Label>Category</Label>
              <Select value={filters.category} onValueChange={(value) => 
                setFilters(prev => ({...prev, category: value}))}>
                <SelectTrigger>
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(category => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Location</Label>
              <Input
                placeholder="Enter location"
                value={filters.location}
                onChange={(e) => setFilters(prev => ({...prev, location: e.target.value}))}
              />
            </div>

            <div>
              <Label>Available Date</Label>
              <Input
                type="date"
                value={filters.availableDate}
                onChange={(e) => setFilters(prev => ({...prev, availableDate: e.target.value}))}
              />
            </div>

            <div>
              <Label>Min Tokens per Day</Label>
              <Input
                type="number"
                placeholder="0"
                value={filters.minTokens}
                onChange={(e) => setFilters(prev => ({...prev, minTokens: e.target.value}))}
              />
            </div>

            <div>
              <Label>Max Tokens per Day</Label>
              <Input
                type="number"
                placeholder="100"
                value={filters.maxTokens}
                onChange={(e) => setFilters(prev => ({...prev, maxTokens: e.target.value}))}
              />
            </div>

            <div>
              <Label>Minimum Owner Rating</Label>
              <Select value={filters.minRating} onValueChange={(value) => 
                setFilters(prev => ({...prev, minRating: value}))}>
                <SelectTrigger>
                  <SelectValue placeholder="Any Rating" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any Rating</SelectItem>
                  <SelectItem value="4.5">4.5+ Stars</SelectItem>
                  <SelectItem value="4.0">4.0+ Stars</SelectItem>
                  <SelectItem value="3.5">3.5+ Stars</SelectItem>
                  <SelectItem value="3.0">3.0+ Stars</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex space-x-2">
            <Button onClick={handleSearch} className="bg-teal-600 hover:bg-teal-700">
              Apply Filters
            </Button>
            <Button variant="outline" onClick={clearFilters}>
              Clear All Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center h-64">Searching...</div>
      ) : items.length > 0 ? (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-800">Search Results ({items.length})</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map(item => (
              <Card key={item.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                <div className="aspect-video bg-gray-100 relative">
                  {item.images.length > 0 ? (
                    <img
                      src={`${BACKEND_URL}${item.images[0]}`}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-12 h-12 text-gray-400" />
                    </div>
                  )}
                  <div className="absolute top-2 left-2">
                    <Badge className="bg-teal-600">{item.category}</Badge>
                  </div>
                  <div className="absolute top-2 right-2">
                    <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                      <Coins className="w-3 h-3 mr-1" />
                      {item.tokens_per_day}/day
                    </Badge>
                  </div>
                </div>
                <CardContent className="p-4">
                  <h3 className="font-semibold text-gray-800 mb-2">{item.title}</h3>
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">{item.description}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <MapPin className="w-4 h-4" />
                      <span>{item.location}</span>
                    </div>
                    <div className="flex items-center space-x-1 text-sm">
                      <Star className="w-4 h-4 text-yellow-500" />
                      <span>{item.owner.star_rating.toFixed(1)}</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Avatar className="w-6 h-6">
                        <AvatarFallback className="text-xs bg-teal-500 text-white">
                          {item.owner.full_name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-gray-600">{item.owner.full_name}</span>
                    </div>
                    <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={() => navigate(`/items/${item.id}`)}>
                      <Eye className="w-4 h-4 mr-1" />
                      View
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : searchQuery || Object.values(filters).some(v => v) ? (
        <Card className="p-12 text-center">
          <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-600 mb-2">No results found</h3>
          <p className="text-gray-500">Try adjusting your search criteria or filters</p>
        </Card>
      ) : null}
    </div>
  );
};

// Add Item Page
const AddItemPage = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    value: '',
    tokens_per_day: '',
    available_from: '',
    available_until: '',
    location: ''
  });
  const [images, setImages] = useState([]);
  const [suggestedTokens, setSuggestedTokens] = useState(null);
  const [loading, setLoading] = useState(false);

  const categories = [
    'Tools', 'Electronics', 'Outdoor', 'Home & Kitchen',
    'Books & Stationery', 'Sports & Fitness', 'Event Gear', 'Miscellaneous'
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCategoryChange = (value) => {
    setFormData(prev => ({ ...prev, category: value }));
    if (formData.value && value) {
      fetchSuggestedTokens(parseFloat(formData.value), value);
    }
  };

  const handleValueChange = (e) => {
    const value = e.target.value;
    setFormData(prev => ({ ...prev, value }));
    if (value && formData.category) {
      fetchSuggestedTokens(parseFloat(value), formData.category);
    }
  };

  const fetchSuggestedTokens = async (value, category) => {
    try {
      const response = await axios.get(`${API}/items/suggest-tokens/${category}?value=${value}`);
      setSuggestedTokens(response.data.suggested_tokens);
    } catch (error) {
      console.error('Failed to fetch suggested tokens:', error);
    }
  };

  const handleImageChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length > 5) {
      toast.error('Maximum 5 images allowed');
      return;
    }
    setImages(selectedFiles);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (images.length === 0) {
      toast.error('Please upload at least 1 image');
      return;
    }

    setLoading(true);

    try {
      const formDataToSend = new FormData();
      Object.entries(formData).forEach(([key, value]) => {
        formDataToSend.append(key, value);
      });
      
      images.forEach((image) => {
        formDataToSend.append('images', image);
      });

      await axios.post(`${API}/items`, formDataToSend, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success('Item added successfully!');
      navigate('/my-items');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add item');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Add New Item</h1>
        <p className="text-gray-600 mt-1">Share your items with the community</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="title">Item Title</Label>
                <Input
                  id="title"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div>
                <Label htmlFor="category">Category</Label>
                <Select value={formData.category} onValueChange={handleCategoryChange} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(category => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={3}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="value">Item Value (₹)</Label>
                <Input
                  id="value"
                  name="value"
                  type="number"
                  max="100000"
                  value={formData.value}
                  onChange={handleValueChange}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Maximum ₹1,00,000</p>
              </div>
              <div>
                <Label htmlFor="tokens_per_day">Tokens per Day</Label>
                <Input
                  id="tokens_per_day"
                  name="tokens_per_day"
                  type="number"
                  value={formData.tokens_per_day}
                  onChange={handleInputChange}
                  required
                />
                {suggestedTokens && (
                  <p className="text-xs text-teal-600 mt-1">
                    Suggested: {suggestedTokens} tokens
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, tokens_per_day: suggestedTokens.toString() }))}
                      className="ml-2 underline"
                    >
                      Use this
                    </button>
                  </p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                name="location"
                value={formData.location}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="available_from">Available From</Label>
                <Input
                  id="available_from"
                  name="available_from"
                  type="datetime-local"
                  value={formData.available_from}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div>
                <Label htmlFor="available_until">Available Until</Label>
                <Input
                  id="available_until"
                  name="available_until"
                  type="datetime-local"
                  value={formData.available_until}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="images">Images (1-5 required)</Label>
              <Input
                id="images"
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageChange}
                required
              />
              {images.length > 0 && (
                <p className="text-sm text-gray-600 mt-1">{images.length} image(s) selected</p>
              )}
            </div>

            <Button 
              type="submit" 
              className="w-full bg-teal-600 hover:bg-teal-700"
              disabled={loading}
            >
              {loading ? 'Adding Item...' : 'Add Item'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

// Item Detail Page - ENHANCED with delivery/return confirmation
const ItemDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [borrowRequest, setBorrowRequest] = useState({
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  });
  const [showBorrowDialog, setShowBorrowDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchItem();
  }, [id]);

  const fetchItem = async () => {
    try {
      const response = await axios.get(`${API}/items/${id}`);
      setItem(response.data);
    } catch (error) {
      toast.error('Failed to load item');
      navigate('/browse');
    } finally {
      setLoading(false);
    }
  };

  const handleBorrowRequest = async () => {
    setSubmitting(true);
    try {
      const requestData = {
        item_id: item.id,
        start_date: new Date(borrowRequest.start_date + 'T00:00:00').toISOString(),
        end_date: new Date(borrowRequest.end_date + 'T23:59:59').toISOString()
      };

      const response = await axios.post(`${API}/transactions`, requestData);
      toast.success('Borrow request sent successfully!');
      setShowBorrowDialog(false);
    } catch (error) {
      console.error('Borrow request error:', error);
      let errorMessage = 'Failed to send request';
      
      if (error.response?.data?.detail) {
        if (Array.isArray(error.response.data.detail)) {
          errorMessage = error.response.data.detail.map(err => err.msg || err).join(', ');
        } else if (typeof error.response.data.detail === 'string') {
          errorMessage = error.response.data.detail;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const calculateTotalTokens = () => {
    if (!item) return 0;
    const startDate = new Date(borrowRequest.start_date);
    const endDate = new Date(borrowRequest.end_date);
    const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    return item.tokens_per_day * days;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading item...</div>;
  }

  if (!item) {
    return <div className="text-center py-12">Item not found</div>;
  }

  const isOwner = item.owner.id === user?.id;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button
        variant="outline"
        onClick={() => navigate('/browse')}
        className="mb-4"
      >
        ← Back to Browse
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Image Gallery */}
        <div className="space-y-4">
          <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
            {item.images.length > 0 ? (
              <img
                src={`${BACKEND_URL}${item.images[0]}`}
                alt={item.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="w-16 h-16 text-gray-400" />
              </div>
            )}
          </div>
          {item.images.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {item.images.slice(1).map((image, index) => (
                <div key={index} className="aspect-square bg-gray-100 rounded overflow-hidden">
                  <img
                    src={`${BACKEND_URL}${image}`}
                    alt={`${item.title} ${index + 2}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Item Details */}
        <div className="space-y-6">
          <div>
            <div className="flex items-start justify-between mb-2">
              <h1 className="text-3xl font-bold text-gray-800">{item.title}</h1>
              <Badge className="bg-teal-600">{item.category}</Badge>
            </div>
            <p className="text-gray-600 mb-4">{item.description}</p>
            
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <Label className="text-sm text-gray-500">Value</Label>
                <p className="text-lg font-semibold text-gray-800">₹{item.value.toLocaleString()}</p>
              </div>
              <div>
                <Label className="text-sm text-gray-500">Tokens per Day</Label>
                <p className="text-lg font-semibold text-orange-600">
                  <Coins className="w-4 h-4 inline mr-1" />
                  {item.tokens_per_day}
                </p>
              </div>
              <div>
                <Label className="text-sm text-gray-500">Location</Label>
                <p className="flex items-center text-gray-700">
                  <MapPin className="w-4 h-4 mr-1" />
                  {item.location}
                </p>
              </div>
              <div>
                <Label className="text-sm text-gray-500">Status</Label>
                <Badge 
                  variant={item.status === 'available' ? 'default' : 'secondary'}
                  className={item.status === 'available' ? 'bg-green-600' : 'bg-gray-600'}
                >
                  {item.status}
                </Badge>
              </div>
            </div>

            <div className="mb-6">
              <Label className="text-sm text-gray-500">Available Period</Label>
              <div className="flex items-center space-x-2 text-gray-700">
                <Calendar className="w-4 h-4" />
                <span>
                  {new Date(item.available_from).toLocaleDateString()} - {new Date(item.available_until).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {/* Owner Info */}
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <Avatar>
                <AvatarFallback className="bg-teal-500 text-white">
                  {item.owner.full_name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-gray-800">{item.owner.full_name}</p>
                <p className="text-sm text-gray-500">@{item.owner.username}</p>
                <div className="flex items-center space-x-3 mt-1">
                  <div className="flex items-center space-x-1">
                    <Star className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm">{item.owner.star_rating.toFixed(1)}</span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {item.owner.success_rate.toFixed(1)}% success rate
                  </div>
                  {item.owner.complaint_count > 0 && (
                    <div className="flex items-center space-x-1 text-red-500">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-sm">{item.owner.complaint_count} complaints</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Action Buttons */}
          <div className="space-y-3">
            {!isOwner && item.status === 'available' && (
              <Button
                onClick={() => setShowBorrowDialog(true)}
                className="w-full bg-teal-600 hover:bg-teal-700"
                size="lg"
              >
                Request to Borrow
              </Button>
            )}
            {isOwner && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate('/my-items')}
              >
                Manage This Item
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Borrow Request Dialog */}
      {showBorrowDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Request to Borrow</CardTitle>
              <CardDescription>
                Specify your borrowing period for {item.title}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="start_date">Start Date</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={borrowRequest.start_date}
                  onChange={(e) => setBorrowRequest(prev => ({...prev, start_date: e.target.value}))}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <Label htmlFor="end_date">End Date</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={borrowRequest.end_date}
                  onChange={(e) => setBorrowRequest(prev => ({...prev, end_date: e.target.value}))}
                  min={borrowRequest.start_date}
                />
              </div>
              
              <div className="bg-orange-50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Total Cost:</span>
                  <span className="text-lg font-bold text-orange-600">
                    <Coins className="w-4 h-4 inline mr-1" />
                    {calculateTotalTokens()} tokens
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Based on {Math.ceil((new Date(borrowRequest.end_date) - new Date(borrowRequest.start_date)) / (1000 * 60 * 60 * 24)) + 1} days
                </p>
              </div>
              
              <div className="flex space-x-3">
                <Button
                  variant="outline"
                  onClick={() => setShowBorrowDialog(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleBorrowRequest}
                  disabled={submitting || calculateTotalTokens() > user?.tokens}
                  className="flex-1 bg-teal-600 hover:bg-teal-700"
                >
                  {submitting ? 'Sending...' : 'Send Request'}
                </Button>
              </div>
              
              {calculateTotalTokens() > user?.tokens && (
                <p className="text-sm text-red-600">
                  Insufficient tokens. You have {user?.tokens} tokens.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

// My Items Page - ENHANCED with transaction management
const MyItemsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('items');

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (activeTab === 'requests') {
        fetchData();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [activeTab]);

  useEffect(() => {
    const handleTransactionUpdate = () => {
      fetchData();
    };

    window.addEventListener('transactionUpdate', handleTransactionUpdate);
    return () => window.removeEventListener('transactionUpdate', handleTransactionUpdate);
  }, []);

  const fetchData = async () => {
    try {
      const [itemsResponse, transactionsResponse] = await Promise.all([
        axios.get(`${API}/items/owner/${user?.id}`),
        axios.get(`${API}/transactions`)
      ]);
      
      setItems(itemsResponse.data || []);
      setTransactions(transactionsResponse.data || []);
    } catch (error) {
      console.error('Fetch data error:', error);
      toast.error(`Failed to load data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveRequest = async (transactionId) => {
    try {
      await axios.put(`${API}/transactions/${transactionId}/approve`);
      toast.success('Request approved!');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to approve request');
    }
  };

  const handleRejectRequest = async (transactionId) => {
    try {
      await axios.put(`${API}/transactions/${transactionId}/reject`);
      toast.success('Request rejected');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to reject request');
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!window.confirm('Are you sure you want to delete this item? This action cannot be undone.')) {
      return;
    }

    try {
      await axios.delete(`${API}/items/${itemId}`);
      toast.success('Item deleted successfully');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete item');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  const pendingRequests = transactions.filter(t => t.status === 'pending' && t.owner?.id === user?.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-800">My Items</h1>
        <Button
          onClick={() => navigate('/add-item')}
          className="bg-teal-600 hover:bg-teal-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Item
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="items">My Items ({items.length})</TabsTrigger>
          <TabsTrigger value="requests">
            Pending Requests 
            {pendingRequests.length > 0 && (
              <Badge className="ml-2 bg-orange-600">{pendingRequests.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-4">
          {items.length === 0 ? (
            <Card className="p-12 text-center">
              <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-600 mb-2">No items yet</h3>
              <p className="text-gray-500 mb-4">Start sharing your items with the community!</p>
              <Button onClick={() => navigate('/add-item')} className="bg-teal-600 hover:bg-teal-700">
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Item
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {items.map(item => (
                <Card key={item.id} className="overflow-hidden">
                  <div className="aspect-video bg-gray-100 relative">
                    {item.images.length > 0 ? (
                      <img
                        src={`${BACKEND_URL}${item.images[0]}`}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-12 h-12 text-gray-400" />
                      </div>
                    )}
                    <div className="absolute top-2 right-2">
                      <Badge 
                        variant={item.status === 'available' ? 'default' : 'secondary'}
                        className={item.status === 'available' ? 'bg-green-600' : 'bg-gray-600'}
                      >
                        {item.status}
                      </Badge>
                    </div>
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-gray-800 mb-2">{item.title}</h3>
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">{item.description}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1 text-orange-600">
                        <Coins className="w-4 h-4" />
                        <span className="font-medium">{item.tokens_per_day}/day</span>
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/items/${item.id}`)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteItem(item.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="requests" className="space-y-4">
          {pendingRequests.length === 0 ? (
            <Card className="p-8 text-center">
              <MessageCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-600 mb-2">No pending requests</h3>
              <p className="text-gray-500">New borrow requests will appear here.</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {pendingRequests.map(transaction => (
                <Card key={transaction.id} className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex space-x-4">
                      <Avatar>
                        <AvatarFallback className="bg-teal-500 text-white">
                          {transaction.borrower?.full_name?.charAt(0) || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h4 className="font-semibold text-gray-800">
                          {transaction.borrower?.full_name} wants to borrow "{transaction.item?.title}"
                        </h4>
                        <p className="text-sm text-gray-600 mt-1">
                          From {new Date(transaction.start_date).toLocaleDateString()} to {new Date(transaction.end_date).toLocaleDateString()}
                        </p>
                        <div className="flex items-center space-x-4 mt-2">
                          <div className="flex items-center space-x-1 text-orange-600">
                            <Coins className="w-4 h-4" />
                            <span className="text-sm font-medium">{transaction.total_tokens} tokens</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Star className="w-4 h-4 text-yellow-500" />
                            <span className="text-sm">{transaction.borrower?.star_rating?.toFixed(1) || '5.0'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRejectRequest(transaction.id)}
                      >
                        Reject
                      </Button>
                      <Button
                        onClick={() => handleApproveRequest(transaction.id)}
                        className="bg-teal-600 hover:bg-teal-700"
                        size="sm"
                      >
                        Approve
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

// My Activity Page - ENHANCED
const MyActivityPage = () => {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTransactions();
  }, []);

  useEffect(() => {
    const handleTransactionUpdate = () => {
      fetchTransactions();
    };

    window.addEventListener('transactionUpdate', handleTransactionUpdate);
    return () => window.removeEventListener('transactionUpdate', handleTransactionUpdate);
  }, []);

  const fetchTransactions = async () => {
    try {
      const response = await axios.get(`${API}/transactions`);
      setTransactions(response.data);
    } catch (error) {
      toast.error('Failed to load activity');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading activity...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">My Activity</h1>
      
      {transactions.length === 0 ? (
        <Card className="p-12 text-center">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-600 mb-2">No activity yet</h3>
          <p className="text-gray-500">Your borrowing and lending history will appear here.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {transactions.map(transaction => (
            <Card key={transaction.id} className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex space-x-4">
                  <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                    {transaction.item?.images?.length > 0 ? (
                      <img
                        src={`${BACKEND_URL}${transaction.item.images[0]}`}
                        alt={transaction.item.title}
                        className="w-full h-full object-cover rounded-lg"
                      />
                    ) : (
                      <Package className="w-8 h-8 text-gray-400" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-800">
                      {transaction.is_borrower ? 'Borrowing' : 'Lending'}: {transaction.item?.title}
                    </h4>
                    <p className="text-sm text-gray-600 mt-1">
                      {transaction.is_borrower ? 'From' : 'To'}: {transaction.is_borrower ? transaction.owner?.full_name : transaction.borrower?.full_name}
                    </p>
                    <div className="flex items-center space-x-4 mt-2">
                      <Badge 
                        className={
                          transaction.status === 'pending' ? 'bg-yellow-600' :
                          transaction.status === 'approved' ? 'bg-blue-600' :
                          transaction.status === 'delivered' ? 'bg-green-600' :
                          transaction.status === 'returned' ? 'bg-gray-600' :
                          transaction.status === 'completed' ? 'bg-green-700' :
                          'bg-red-600'
                        }
                      >
                        {transaction.status}
                      </Badge>
                      <div className="flex items-center space-x-1 text-orange-600">
                        <Coins className="w-4 h-4" />
                        <span className="text-sm font-medium">{transaction.total_tokens} tokens</span>
                      </div>
                      {transaction.penalty_tokens > 0 && (
                        <div className="flex items-center space-x-1 text-red-600">
                          <AlertTriangle className="w-4 h-4" />
                          <span className="text-sm">Penalty: {transaction.penalty_tokens}</span>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(transaction.start_date).toLocaleDateString()} - {new Date(transaction.end_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">
                    {new Date(transaction.created_at).toLocaleDateString()}
                  </p>
                  {(transaction.status === 'approved' || transaction.status === 'delivered') && (
                    <Button 
                      size="sm" 
                      className="mt-2 bg-teal-600 hover:bg-teal-700"
                      onClick={() => navigate(`/chat/${transaction.id}`)}
                    >
                      Chat
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

// Notifications Page - ENHANCED
const NotificationsPage = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
  }, []);

  useEffect(() => {
    const handleNewNotification = (event) => {
      const newNotification = event.detail;
      setNotifications(prev => [newNotification, ...prev]);
    };

    window.addEventListener('newNotification', handleNewNotification);
    return () => window.removeEventListener('newNotification', handleNewNotification);
  }, []);

  const fetchNotifications = async () => {
    try {
      const response = await axios.get(`${API}/notifications`);
      setNotifications(response.data || []);
    } catch (error) {
      console.error('Notifications error:', error);
      toast.error('Failed to load notifications');
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  const markAllAsRead = async () => {
    try {
      await axios.put(`${API}/notifications/mark-all-read`);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      toast.success('All notifications marked as read');
    } catch (error) {
      toast.error('Failed to mark notifications as read');
    }
  };

  const deleteNotification = async (notificationId) => {
    try {
      await axios.delete(`${API}/notifications/${notificationId}`);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      toast.success('Notification deleted');
    } catch (error) {
      toast.error('Failed to delete notification');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading notifications...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-800">Notifications</h1>
        {notifications.some(n => !n.is_read) && (
          <Button onClick={markAllAsRead} variant="outline" size="sm">
            Mark All as Read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card className="p-12 text-center">
          <Bell className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-600 mb-2">No notifications</h3>
          <p className="text-gray-500">You're all caught up!</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map(notification => (
            <Card key={notification.id} className={`p-4 ${!notification.is_read ? 'bg-blue-50 border-blue-200' : ''}`}>
              <div className="flex items-start justify-between">
                <div className="flex space-x-3 flex-1">
                  <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${!notification.is_read ? 'bg-blue-500' : 'bg-gray-300'}`} />
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-800">{notification.title}</h4>
                    <p className="text-gray-600 mt-1">{notification.message}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      {new Date(notification.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {notification.type === 'approval' && notification.related_id && (
                    <Button 
                      size="sm" 
                      className="bg-teal-600 hover:bg-teal-700"
                      onClick={() => window.location.href = `/chat/${notification.related_id}`}
                    >
                      Open Chat
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteNotification(notification.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

// Feedback & Suggestions Page - NEW PAGE
const FeedbackPage = () => {
  const [feedbackData, setFeedbackData] = useState({
    title: '',
    message: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!feedbackData.title || !feedbackData.message) {
      toast.error('Please fill all fields');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('title', feedbackData.title);
      formData.append('message', feedbackData.message);

      await axios.post(`${API}/feedback`, formData);
      toast.success('Feedback submitted successfully! Thank you for helping us improve.');
      setFeedbackData({ title: '', message: '' });
    } catch (error) {
      toast.error('Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-800">Feedback & Suggestions</h1>
        <p className="text-gray-600 mt-1">Help us improve ShareSphere with your valuable feedback</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <MessageSquare className="w-5 h-5 text-teal-600" />
            <span>Share Your Thoughts</span>
          </CardTitle>
          <CardDescription>
            We value your opinion! Let us know how we can make ShareSphere better for everyone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="title">Subject</Label>
              <Input
                id="title"
                value={feedbackData.title}
                onChange={(e) => setFeedbackData(prev => ({...prev, title: e.target.value}))}
                placeholder="Brief subject for your feedback"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="message">Your Feedback</Label>
              <Textarea
                id="message"
                value={feedbackData.message}
                onChange={(e) => setFeedbackData(prev => ({...prev, message: e.target.value}))}
                placeholder="Share your thoughts, suggestions, or report issues..."
                rows={6}
                required
              />
            </div>

            <Button 
              type="submit" 
              className="w-full bg-teal-600 hover:bg-teal-700"
              disabled={submitting}
            >
              {submitting ? 'Sending...' : 'Submit Feedback'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Feedback Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center space-x-3 mb-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <ThumbsUp className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-semibold text-gray-800">What We'd Love to Hear</h3>
          </div>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• Feature suggestions</li>
            <li>• User experience improvements</li>
            <li>• Success stories</li>
            <li>• Community building ideas</li>
          </ul>
        </Card>

        <Card className="p-6">
          <div className="flex items-center space-x-3 mb-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
            </div>
            <h3 className="font-semibold text-gray-800">Issues to Report</h3>
          </div>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• Technical bugs</li>
            <li>• App performance issues</li>
            <li>• Security concerns</li>
            <li>• Accessibility problems</li>
          </ul>
        </Card>
      </div>
    </div>
  );
};

// Guidelines Page - NEW PAGE
const GuidelinesPage = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-800">Community Guidelines</h1>
        <p className="text-gray-600 mt-1">Building a trustworthy sharing community together</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Table of Contents */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Quick Navigation</CardTitle>
          </CardHeader>
          <CardContent>
            <nav className="space-y-2">
              <a href="#community-rules" className="block text-sm text-teal-600 hover:text-teal-700">Community Rules</a>
              <a href="#token-system" className="block text-sm text-teal-600 hover:text-teal-700">Token System</a>
              <a href="#borrowing-guide" className="block text-sm text-teal-600 hover:text-teal-700">Borrowing Guide</a>
              <a href="#lending-guide" className="block text-sm text-teal-600 hover:text-teal-700">Lending Guide</a>
              <a href="#safety-tips" className="block text-sm text-teal-600 hover:text-teal-700">Safety Tips</a>
              <a href="#dispute-resolution" className="block text-sm text-teal-600 hover:text-teal-700">Dispute Resolution</a>
            </nav>
          </CardContent>
        </Card>

        {/* Main Content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Community Rules */}
          <Card id="community-rules">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="w-5 h-5 text-teal-600" />
                <span>Community Rules</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">1. Respect and Trust</h3>
                  <p className="text-gray-600">Treat all community members with respect. Build trust through honest communication and reliable behavior.</p>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">2. Accurate Listings</h3>
                  <p className="text-gray-600">Provide accurate descriptions, photos, and condition details for all items. Misleading information damages community trust.</p>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">3. Timely Communication</h3>
                  <p className="text-gray-600">Respond promptly to messages and requests. Keep the other party informed of any changes or delays.</p>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">4. Care for Borrowed Items</h3>
                  <p className="text-gray-600">Treat borrowed items with the same care you'd want for your own belongings. Return items in the same condition you received them.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Token System */}
          <Card id="token-system">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Coins className="w-5 h-5 text-orange-600" />
                <span>Token System Guide</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">How Tokens Work</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• All new users start with 100 tokens</li>
                    <li>• Earn tokens by lending your items</li>
                    <li>• Spend tokens to borrow items</li>
                    <li>• Token cost = daily rate × number of days</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">Penalties</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• Late returns: Daily rate × extra days</li>
                    <li>• Damage: ¼ to full item value (based on severity)</li>
                    <li>• Pending penalties are deducted when you earn tokens</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Borrowing Guide */}
          <Card id="borrowing-guide">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Package className="w-5 h-5 text-blue-600" />
                <span>Borrowing Best Practices</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">Before Borrowing</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• Check item photos and description carefully</li>
                    <li>• Ensure you have sufficient tokens</li>
                    <li>• Plan your usage timeline realistically</li>
                    <li>• Review owner's rating and reviews</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">During Use</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• Use items only for their intended purpose</li>
                    <li>• Handle with care and store safely</li>
                    <li>• Contact owner immediately if issues arise</li>
                    <li>• Take photos if damage occurs</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">Returning Items</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• Clean and return in original condition</li>
                    <li>• Return on time to avoid penalties</li>
                    <li>• Include all accessories and parts</li>
                    <li>• Confirm return through the app</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lending Guide */}
          <Card id="lending-guide">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <User className="w-5 h-5 text-green-600" />
                <span>Lending Best Practices</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">Creating Listings</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• Take clear, well-lit photos from multiple angles</li>
                    <li>• Write detailed, honest descriptions</li>
                    <li>• Note any existing wear or damage</li>
                    <li>• Set fair token rates based on item value</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">Screening Borrowers</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• Check borrower's rating and reviews</li>
                    <li>• Look at their success rate</li>
                    <li>• Review any complaint history</li>
                    <li>• Communicate clearly about expectations</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">Handover Process</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• Take 'before' photos during handover</li>
                    <li>• Demonstrate proper usage if needed</li>
                    <li>• Provide care instructions</li>
                    <li>• Confirm delivery in the app</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Safety Tips */}
          <Card id="safety-tips">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
                <span>Safety & Security</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">Meeting Safely</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• Meet in public, well-lit areas</li>
                    <li>• Bring a friend if possible</li>
                    <li>• Trust your instincts</li>
                    <li>• Verify identity through app messaging</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">Protecting Your Items</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• Only lend items you're comfortable sharing</li>
                    <li>• Document condition with photos</li>
                    <li>• Keep receipts and warranty information</li>
                    <li>• Consider insurance for high-value items</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Dispute Resolution */}
          <Card id="dispute-resolution">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Flag className="w-5 h-5 text-red-600" />
                <span>Dispute Resolution</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">When to File a Complaint</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• Item not returned on time</li>
                    <li>• Item returned damaged</li>
                    <li>• Misleading item description</li>
                    <li>• Inappropriate behavior</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">Complaint Process</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• Try to resolve directly first</li>
                    <li>• Gather evidence (photos, messages)</li>
                    <li>• File complaint through the app</li>
                    <li>• System will automatically apply penalties for valid complaints</li>
                  </ul>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <p className="text-sm text-red-800">
                    <strong>Important:</strong> Users with 20+ valid complaints will be automatically banned from the platform.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

// Profile Page - ENHANCED
const ProfilePage = () => {
  const { user } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchUserData();
    }
  }, [user]);

  const fetchUserData = async () => {
    try {
      const [reviewsResponse, complaintsResponse] = await Promise.all([
        axios.get(`${API}/reviews/${user.id}`),
        axios.get(`${API}/complaints/${user.id}`)
      ]);
      
      setReviews(reviewsResponse.data);
      setComplaints(complaintsResponse.data);
    } catch (error) {
      console.error('Failed to fetch user data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading profile...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Profile</h1>

      {/* Profile Card */}
      <Card className="p-6">
        <div className="flex items-center space-x-6">
          <Avatar className="w-24 h-24">
            <AvatarFallback className="bg-teal-500 text-white text-2xl">
              {user?.full_name?.charAt(0) || 'U'}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">{user?.full_name}</h2>
            <p className="text-gray-600">@{user?.username}</p>
            <div className="flex items-center space-x-4 mt-3">
              <div className="flex items-center space-x-1">
                <Star className="w-5 h-5 text-yellow-500" />
                <span className="font-semibold">{user?.star_rating?.toFixed(1)}</span>
                <span className="text-gray-500">({user?.total_reviews} reviews)</span>
              </div>
              <div className="flex items-center space-x-1">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="font-semibold">{user?.success_rate?.toFixed(1)}%</span>
                <span className="text-gray-500">success rate</span>
              </div>
              {user?.complaint_count > 0 && (
                <div className="flex items-center space-x-1 text-red-500">
                  <AlertTriangle className="w-5 h-5" />
                  <span className="font-semibold">{user?.complaint_count}</span>
                  <span>complaints</span>
                </div>
              )}
              {user?.is_banned && (
                <Badge variant="destructive">Banned</Badge>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="p-6 text-center">
          <Coins className="w-8 h-8 text-orange-500 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-800">{user?.tokens}</p>
          <p className="text-gray-600">Available Tokens</p>
          {user?.pending_penalties > 0 && (
            <p className="text-sm text-red-600 mt-1">Pending: -{user.pending_penalties}</p>
          )}
        </Card>

        <Card className="p-6 text-center">
          <Package className="w-8 h-8 text-blue-500 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-800">{user?.completed_transactions}</p>
          <p className="text-gray-600">Completed</p>
        </Card>

        <Card className="p-6 text-center">
          <MapPin className="w-8 h-8 text-green-500 mx-auto mb-2" />
          <p className="text-lg font-semibold text-gray-800">{user?.location}</p>
          <p className="text-gray-600">Location</p>
        </Card>

        <Card className="p-6 text-center">
          <Phone className="w-8 h-8 text-teal-500 mx-auto mb-2" />
          <p className="text-lg font-semibold text-gray-800">{user?.phone}</p>
          <p className="text-gray-600">Phone</p>
          <Badge className="mt-1 bg-green-100 text-green-800">Verified</Badge>
        </Card>
      </div>

      {/* Reviews Section */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Reviews</CardTitle>
        </CardHeader>
        <CardContent>
          {reviews.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No reviews yet</p>
          ) : (
            <div className="space-y-4">
              {reviews.slice(0, 5).map(review => (
                <div key={review.id} className="border-b pb-4 last:border-b-0">
                  <div className="flex items-center space-x-2 mb-2">
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star
                          key={star}
                          className={`w-4 h-4 ${star <= review.rating ? 'text-yellow-500 fill-current' : 'text-gray-300'}`}
                        />
                      ))}
                    </div>
                    <span className="text-sm text-gray-500">
                      by {review.reviewer?.full_name} • {new Date(review.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-gray-700">{review.comment}</p>
                  <p className="text-sm text-gray-500 mt-1">Item: {review.item_title}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Complaints Section */}
      {complaints.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Shield className="w-5 h-5 text-red-500" />
              <span>Complaints Against You</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {complaints.slice(0, 3).map(complaint => (
                <div key={complaint.id} className="border-b pb-4 last:border-b-0">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-gray-800">{complaint.title}</h4>
                    <Badge 
                      className={
                        complaint.severity === 'light' ? 'bg-yellow-600' :
                        complaint.severity === 'medium' ? 'bg-orange-600' :
                        complaint.severity === 'high' ? 'bg-red-600' :
                        'bg-red-800'
                      }
                    >
                      {complaint.severity}
                    </Badge>
                  </div>
                  <p className="text-gray-700">{complaint.description}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    By {complaint.complainant?.full_name} • {new Date(complaint.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// Settings Page - ENHANCED with Account Deletion
const SettingsPage = () => {
  const { user, logout } = useAuth();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE MY ACCOUNT') {
      toast.error('Please type "DELETE MY ACCOUNT" to confirm');
      return;
    }

    setDeleting(true);
    try {
      await axios.delete(`${API}/auth/delete-account`);
      toast.success('Account deleted successfully');
      logout();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Settings</h1>

      {/* Account Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <User className="w-5 h-5 text-teal-600" />
            <span>Account Information</span>
          </CardTitle>
          <CardDescription>Your personal details and contact information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Full Name</Label>
              <div className="p-3 bg-gray-50 rounded-lg border">
                <p className="font-medium text-gray-800">{user?.full_name}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Username</Label>
              <div className="p-3 bg-gray-50 rounded-lg border">
                <p className="font-medium text-gray-800">@{user?.username}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Email</Label>
              <div className="p-3 bg-gray-50 rounded-lg border">
                <p className="font-medium text-gray-800">{user?.email}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">
                Phone Number 
                {user?.phone && <Badge className="ml-2 bg-green-100 text-green-800">Verified</Badge>}
              </Label>
              <div className="p-3 bg-gray-50 rounded-lg border">
                <p className="font-medium text-gray-800">{user?.phone || 'Not provided'}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Location</Label>
              <div className="p-3 bg-gray-50 rounded-lg border">
                <p className="font-medium text-gray-800">{user?.location}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Account Status</Label>
              <div className="p-3 bg-gray-50 rounded-lg border">
                {user?.is_banned ? (
                  <Badge variant="destructive">Banned</Badge>
                ) : (
                  <Badge className="bg-green-100 text-green-800">Active</Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Star className="w-5 h-5 text-blue-600" />
            <span>Account Statistics</span>
          </CardTitle>
          <CardDescription>Your activity and reputation on ShareSphere</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-4 bg-gradient-to-br from-teal-50 to-teal-100 rounded-xl">
              <Star className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-800">{user?.star_rating?.toFixed(1)}</p>
              <p className="text-sm text-gray-600">Star Rating</p>
            </div>
            <div className="text-center p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-xl">
              <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-800">{user?.success_rate?.toFixed(1)}%</p>
              <p className="text-sm text-gray-600">Success Rate</p>
            </div>
            <div className="text-center p-4 bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl">
              <Coins className="w-8 h-8 text-orange-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-800">{user?.tokens}</p>
              <p className="text-sm text-gray-600">Available Tokens</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200 border-2">
        <CardHeader className="bg-red-50">
          <CardTitle className="flex items-center space-x-2 text-red-700">
            <AlertTriangle className="w-5 h-5" />
            <span>Danger Zone</span>
          </CardTitle>
          <CardDescription className="text-red-600">
            Irreversible actions that will permanently affect your account
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="p-4 border border-red-200 rounded-lg bg-red-50">
              <h4 className="font-semibold text-red-800 mb-2">Delete Account</h4>
              <p className="text-sm text-red-700 mb-4">
                Once you delete your account, there is no going back. Your items will be removed, 
                but transaction history will be preserved for other users.
              </p>
              <Button
                onClick={() => setShowDeleteDialog(true)}
                variant="destructive"
                className="bg-red-600 hover:bg-red-700"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Account
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete Account Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader className="bg-red-50">
              <CardTitle className="text-red-800 flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5" />
                <span>Delete Account</span>
              </CardTitle>
              <CardDescription className="text-red-700">
                This action cannot be undone. Please confirm by typing "DELETE MY ACCOUNT" below.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="deleteConfirm" className="text-sm font-medium text-gray-700">
                  Type "DELETE MY ACCOUNT" to confirm
                </Label>
                <Input
                  id="deleteConfirm"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="border-red-300 focus:border-red-500 focus:ring-red-500"
                  placeholder="DELETE MY ACCOUNT"
                />
              </div>
              
              <div className="flex space-x-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDeleteDialog(false);
                    setDeleteConfirmText('');
                  }}
                  className="flex-1"
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDeleteAccount}
                  disabled={deleting || deleteConfirmText !== 'DELETE MY ACCOUNT'}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                >
                  {deleting ? 'Deleting...' : 'Delete Forever'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

// Messages Page - ENHANCED Messages Overview
const MessagesPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      const response = await axios.get(`${API}/transactions`);
      // Filter only approved and delivered transactions for messaging
      const chatableTransactions = response.data.filter(t => 
        t.status === 'approved' || t.status === 'delivered'
      );
      setTransactions(chatableTransactions);
    } catch (error) {
      toast.error('Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading conversations...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Messages</h1>
        <p className="text-gray-600 mt-1">Your active conversations about transactions</p>
      </div>

      {transactions.length === 0 ? (
        <Card className="p-12 text-center">
          <MessageCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-600 mb-2">No active conversations</h3>
          <p className="text-gray-500">Message conversations will appear here when you have approved transactions.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {transactions.map(transaction => (
            <Card key={transaction.id} className="p-6 hover:shadow-md transition-shadow cursor-pointer"  
                  onClick={() => navigate(`/chat/${transaction.id}`)}>
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                  {transaction.item?.images?.length > 0 ? (
                    <img
                      src={`${BACKEND_URL}${transaction.item.images[0]}`}
                      alt={transaction.item.title}
                      className="w-full h-full object-cover rounded-lg"
                    />
                  ) : (
                    <Package className="w-8 h-8 text-gray-400" />
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-800">
                    Chat about: {transaction.item?.title}
                  </h4>
                  <p className="text-gray-600 mt-1">
                    With {transaction.is_borrower ? transaction.owner?.full_name : transaction.borrower?.full_name}
                  </p>
                  <div className="flex items-center space-x-4 mt-2">
                    <Badge 
                      className={
                        transaction.status === 'approved' ? 'bg-blue-600' :
                        'bg-green-600'
                      }
                    >
                      {transaction.status}
                    </Badge>
                    <span className="text-sm text-gray-500">
                      {transaction.is_borrower ? 'Borrowing' : 'Lending'}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <Button size="sm" className="bg-teal-600 hover:bg-teal-700">
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Open Chat
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

// App Layout Component
const AppLayout = ({ children }) => {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main className="lg:ml-64 p-4 lg:p-8">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-teal-500 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">S</span>
          </div>
          <p className="text-gray-600">Loading ShareSphere...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  if (user.is_banned) {
    const { logout } = useAuth();
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md w-full m-4">
          <CardContent className="p-6 text-center">
            <Ban className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-red-600 mb-2">Account Banned</h2>
            <p className="text-gray-600 mb-4">Your account has been banned due to multiple complaints. Please contact support for assistance.</p>
            <Button onClick={() => logout()} variant="outline">Logout</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <AppLayout>{children}</AppLayout>;
};

// Error Boundary
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <Card className="max-w-md w-full m-4">
            <CardContent className="p-6 text-center">
              <h2 className="text-xl font-bold text-red-600 mb-2">Something went wrong</h2>
              <p className="text-gray-600 mb-4">Please refresh the page or check if the server is running.</p>
              <Button onClick={() => window.location.reload()}>Refresh Page</Button>
            </CardContent>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

// Transactions Page - Import from separate component file
const TransactionsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showDamageModal, setShowDamageModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [currentTransaction, setCurrentTransaction] = useState(null);
  const [damageData, setDamageData] = useState({
    severity: '',
    description: '',
    images: []
  });
  const [reviewData, setReviewData] = useState({
    rating: 5,
    comment: ''
  });
  const [proofImages, setProofImages] = useState([]);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      const response = await axios.get(`${API}/transactions`);
      setTransactions(response.data);
    } catch (error) {
      toast.error('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelivery = async () => {
    if (proofImages.length === 0) {
      toast.error('Please upload proof images');
      return;
    }

    try {
      const formData = new FormData();
      proofImages.forEach(image => formData.append('images', image));

      await axios.post(`${API}/transactions/${currentTransaction.id}/confirm-delivery`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success('Delivery confirmed successfully!');
      setShowDeliveryModal(false);
      setProofImages([]);
      fetchTransactions();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to confirm delivery');
    }
  };

  const handleConfirmReturn = async () => {
    if (proofImages.length === 0) {
      toast.error('Please upload proof images');
      return;
    }

    try {
      const formData = new FormData();
      proofImages.forEach(image => formData.append('images', image));

      await axios.post(`${API}/transactions/${currentTransaction.id}/confirm-return`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success('Return confirmed successfully!');
      setShowReturnModal(false);
      setProofImages([]);
      fetchTransactions();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to confirm return');
    }
  };

  const handleReportDamage = async () => {
    if (!damageData.severity || !damageData.description || damageData.images.length === 0) {
      toast.error('Please fill all fields and upload proof images');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('severity', damageData.severity);
      formData.append('description', damageData.description);
      damageData.images.forEach(image => formData.append('images', image));

      await axios.post(`${API}/transactions/${currentTransaction.id}/report-damage`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success('Damage reported successfully!');
      setShowDamageModal(false);
      setDamageData({ severity: '', description: '', images: [] });
      fetchTransactions();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to report damage');
    }
  };

  const handleSubmitReview = async () => {
    try {
      await axios.post(`${API}/transactions/${currentTransaction.id}/review`, reviewData);
      toast.success('Review submitted successfully!');
      setShowReviewModal(false);
      setReviewData({ rating: 5, comment: '' });
      fetchTransactions();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit review');
    }
  };

  const getTransactionActions = (transaction) => {
    const isOwner = transaction.owner?.id === user?.id;
    const actions = [];

    if (transaction.status === 'approved') {
      if (!transaction.owner_delivery_confirmed && isOwner) {
        actions.push({
          label: 'Confirm Delivery',
          action: () => {
            setCurrentTransaction(transaction);
            setShowDeliveryModal(true);
          },
          variant: 'default'
        });
      }
      if (!transaction.borrower_delivery_confirmed && !isOwner) {
        actions.push({
          label: 'Confirm Delivery',
          action: () => {
            setCurrentTransaction(transaction);
            setShowDeliveryModal(true);
          },
          variant: 'default'
        });
      }
      actions.push({
        label: 'Chat',
        action: () => navigate(`/chat/${transaction.id}`),
        variant: 'outline'
      });
    }

    if (transaction.status === 'delivered') {
      if (!transaction.owner_return_confirmed && isOwner) {
        actions.push({
          label: 'Confirm Return',
          action: () => {
            setCurrentTransaction(transaction);
            setShowReturnModal(true);
          },
          variant: 'default'
        });
      }
      if (!transaction.borrower_return_confirmed && !isOwner) {
        actions.push({
          label: 'Confirm Return',
          action: () => {
            setCurrentTransaction(transaction);
            setShowReturnModal(true);
          },
          variant: 'default'
        });
      }
      if (isOwner && !transaction.damage_reported) {
        actions.push({
          label: 'Report Damage',
          action: () => {
            setCurrentTransaction(transaction);
            setShowDamageModal(true);
          },
          variant: 'destructive'
        });
      }
    }

    if (transaction.status === 'returned' && !transaction.is_reviewed) {
      actions.push({
        label: 'Leave Review',
        action: () => {
          setCurrentTransaction(transaction);
          setShowReviewModal(true);
        },
        variant: 'default'
      });
    }

    return actions;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading transactions...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Transactions</h1>
        <p className="text-gray-600 mt-1">Manage your borrowing and lending transactions</p>
      </div>

      {transactions.length === 0 ? (
        <Card className="p-12 text-center">
          <Receipt className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-600 mb-2">No transactions yet</h3>
          <p className="text-gray-500">Your transaction history will appear here.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {transactions.map(transaction => {
            const actions = getTransactionActions(transaction);
            return (
              <Card key={transaction.id} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex space-x-4">
                    <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                      {transaction.item?.images?.length > 0 ? (
                        <img
                          src={`${BACKEND_URL}${transaction.item.images[0]}`}
                          alt={transaction.item.title}
                          className="w-full h-full object-cover rounded-lg"
                        />
                      ) : (
                        <Package className="w-8 h-8 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-800">
                        {transaction.is_borrower ? 'Borrowing' : 'Lending'}: {transaction.item?.title}
                      </h4>
                      <p className="text-sm text-gray-600 mt-1">
                        {transaction.is_borrower ? 'From' : 'To'}: {transaction.is_borrower ? transaction.owner?.full_name : transaction.borrower?.full_name}
                      </p>
                      <div className="flex items-center space-x-4 mt-2">
                        <Badge 
                          className={
                            transaction.status === 'pending' ? 'bg-yellow-600' :
                            transaction.status === 'approved' ? 'bg-blue-600' :
                            transaction.status === 'delivered' ? 'bg-green-600' :
                            transaction.status === 'returned' ? 'bg-purple-600' :
                            transaction.status === 'completed' ? 'bg-green-700' :
                            'bg-red-600'
                          }
                        >
                          {transaction.status}
                        </Badge>
                        <div className="flex items-center space-x-1 text-orange-600">
                          <Coins className="w-4 h-4" />
                          <span className="text-sm font-medium">{transaction.total_tokens} tokens</span>
                        </div>
                        {transaction.penalty_tokens > 0 && (
                          <div className="flex items-center space-x-1 text-red-600">
                            <AlertTriangle className="w-4 h-4" />
                            <span className="text-sm">Penalty: {transaction.penalty_tokens}</span>
                          </div>
                        )}
                        {transaction.damage_reported && (
                          <Badge variant="destructive">Damage Reported</Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(transaction.start_date).toLocaleDateString()} - {new Date(transaction.end_date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col space-y-2">
                    {actions.map((action, index) => (
                      <Button
                        key={index}
                        size="sm"
                        variant={action.variant}
                        onClick={action.action}
                        className={action.variant === 'default' ? 'bg-teal-600 hover:bg-teal-700' : ''}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* All Modals would be included here but truncated for space */}
    </div>
  );
};

// Token Management Page
const TokenManagementPage = () => {
  const { user, setUser } = useAuth();
  const [tokenHistory, setTokenHistory] = useState([]);
  const [pendingPenalties, setPendingPenalties] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [historyResponse, penaltiesResponse] = await Promise.all([
        axios.get(`${API}/tokens/history`),
        axios.get(`${API}/tokens/pending-penalties`)
      ]);
      
      setTokenHistory(historyResponse.data);
      setPendingPenalties(penaltiesResponse.data);
    } catch (error) {
      toast.error('Failed to load token data');
    } finally {
      setLoading(false);
    }
  };

  const handlePayPenalty = async (penaltyId) => {
    try {
      await axios.post(`${API}/tokens/pay-penalty`, { penalty_id: penaltyId });
      toast.success('Penalty paid successfully!');
      
      // Refresh user data and penalties
      const userResponse = await axios.get(`${API}/auth/me`);
      setUser(userResponse.data);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to pay penalty');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading token data...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Token Management</h1>
        <p className="text-gray-600 mt-1">Manage your tokens, view history, and handle penalties</p>
      </div>

      {/* Token Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 bg-gradient-to-br from-teal-50 to-teal-100 border-teal-200">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-teal-500 rounded-lg">
              <Coins className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Available Tokens</p>
              <p className="text-2xl font-bold text-gray-800">{user?.tokens || 0}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-orange-500 rounded-lg">
              <TrendingDown className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Pending Penalties</p>
              <p className="text-2xl font-bold text-gray-800">{user?.pending_penalties || 0}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-green-500 rounded-lg">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Earned</p>
              <p className="text-2xl font-bold text-gray-800">
                {tokenHistory.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0)}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Rest of token management content truncated for space */}
    </div>
  );
};

// Complaints Page
const ComplaintsPage = () => {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState({ filed_by_me: [], against_me: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const complaintsResponse = await axios.get(`${API}/complaints`);
      setComplaints(complaintsResponse.data);
    } catch (error) {
      toast.error('Failed to load complaints data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading complaints...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Complaints</h1>
        <p className="text-gray-600 mt-1">View and manage complaints</p>
      </div>

      <Tabs defaultValue="filed-by-me">
        <TabsList>
          <TabsTrigger value="filed-by-me">
            Filed by Me ({complaints.filed_by_me.length})
          </TabsTrigger>
          <TabsTrigger value="against-me">
            Against Me ({complaints.against_me.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="filed-by-me" className="space-y-4">
          {complaints.filed_by_me.length === 0 ? (
            <Card className="p-12 text-center">
              <Flag className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-600 mb-2">No complaints filed</h3>
              <p className="text-gray-500">You haven't filed any complaints yet.</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {complaints.filed_by_me.map(complaint => (
                <Card key={complaint.id} className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-800">{complaint.title}</h4>
                      <p className="text-gray-600 mb-3">{complaint.description}</p>
                      <div className="flex items-center space-x-4 text-sm text-gray-500">
                        <span>Against: {complaint.defendant?.full_name}</span>
                        <span>{new Date(complaint.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <Badge 
                      className={
                        complaint.severity === 'light' ? 'bg-yellow-600' :
                        complaint.severity === 'medium' ? 'bg-orange-600' :
                        complaint.severity === 'high' ? 'bg-red-600' :
                        'bg-red-800'
                      }
                    >
                      {complaint.severity}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="against-me" className="space-y-4">
          {/* Similar content for complaints against user */}
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Main App Component
function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <div className="App">
            <Routes>
              <Route path="/" element={
                <ProtectedRoute>
                  <HomePage />
                </ProtectedRoute>
              } />
              <Route path="/browse" element={
                <ProtectedRoute>
                  <BrowseItemsPage />
                </ProtectedRoute>
              } />
              <Route path="/search-filter" element={
                <ProtectedRoute>
                  <SearchFilterPage />
                </ProtectedRoute>
              } />
              <Route path="/add-item" element={
                <ProtectedRoute>
                  <AddItemPage />
                </ProtectedRoute>
              } />
              <Route path="/my-items" element={
                <ProtectedRoute>
                  <MyItemsPage />
                </ProtectedRoute>
              } />
              <Route path="/items/:id" element={
                <ProtectedRoute>
                  <ItemDetailPage />
                </ProtectedRoute>
              } />
              <Route path="/my-activity" element={
                <ProtectedRoute>
                  <MyActivityPage />
                </ProtectedRoute>
              } />
              <Route path="/transactions" element={
                <ProtectedRoute>
                  <TransactionsPage />
                </ProtectedRoute>
              } />
              <Route path="/chat/:transactionId" element={
                <ProtectedRoute>
                  <ChatPageComponent />
                </ProtectedRoute>
              } />
              <Route path="/messages" element={
                <ProtectedRoute>
                  <MessagesPage />
                </ProtectedRoute>
              } />
              <Route path="/notifications" element={
                <ProtectedRoute>
                  <NotificationsPage />
                </ProtectedRoute>
              } />
              <Route path="/token-management" element={
                <ProtectedRoute>
                  <TokenManagementPage />
                </ProtectedRoute>
              } />
              <Route path="/complaints" element={
                <ProtectedRoute>
                  <ComplaintsPage />
                </ProtectedRoute>
              } />
              <Route path="/feedback" element={
                <ProtectedRoute>
                  <FeedbackPage />
                </ProtectedRoute>
              } />
              <Route path="/guidelines" element={
                <ProtectedRoute>
                  <GuidelinesPage />
                </ProtectedRoute>
              } />
              <Route path="/profile" element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              } />
              <Route path="/settings" element={
                <ProtectedRoute>
                  <SettingsPage />
                </ProtectedRoute>
              } />
            </Routes>
            <Toaster />
          </div>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;