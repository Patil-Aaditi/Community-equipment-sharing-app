// Continuing App.js components...

// Transactions Page - NEW COMPREHENSIVE PAGE
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

      {/* Delivery Confirmation Modal */}
      {showDeliveryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Confirm Delivery</CardTitle>
              <CardDescription>
                Upload proof images to confirm delivery of {currentTransaction?.item?.title}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Upload Proof Images</Label>
                <Input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => setProofImages(Array.from(e.target.files))}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Upload {currentTransaction?.is_borrower ? 'after delivery' : 'before lending'} photos
                </p>
              </div>
              <div className="flex space-x-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDeliveryModal(false);
                    setProofImages([]);
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmDelivery}
                  className="flex-1 bg-teal-600 hover:bg-teal-700"
                >
                  Confirm Delivery
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Return Confirmation Modal */}
      {showReturnModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Confirm Return</CardTitle>
              <CardDescription>
                Upload proof images to confirm return of {currentTransaction?.item?.title}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Upload Proof Images</Label>
                <Input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => setProofImages(Array.from(e.target.files))}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Upload {currentTransaction?.is_borrower ? 'after return' : 'item condition after return'} photos
                </p>
              </div>
              <div className="flex space-x-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowReturnModal(false);
                    setProofImages([]);
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmReturn}
                  className="flex-1 bg-teal-600 hover:bg-teal-700"
                >
                  Confirm Return
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Damage Report Modal */}
      {showDamageModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Report Damage</CardTitle>
              <CardDescription>
                Report damage to {currentTransaction?.item?.title}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Damage Severity</Label>
                <Select value={damageData.severity} onValueChange={(value) => 
                  setDamageData(prev => ({...prev, severity: value}))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light (¼ penalty)</SelectItem>
                    <SelectItem value="medium">Medium (⅓ penalty)</SelectItem>
                    <SelectItem value="high">High (½ penalty)</SelectItem>
                    <SelectItem value="severe">Severe (full penalty)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={damageData.description}
                  onChange={(e) => setDamageData(prev => ({...prev, description: e.target.value}))}
                  placeholder="Describe the damage..."
                />
              </div>
              <div>
                <Label>Upload Proof Images</Label>
                <Input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => setDamageData(prev => ({...prev, images: Array.from(e.target.files)}))}
                />
              </div>
              <div className="flex space-x-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDamageModal(false);
                    setDamageData({ severity: '', description: '', images: [] });
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleReportDamage}
                  variant="destructive"
                  className="flex-1"
                >
                  Report Damage
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Review Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Leave a Review</CardTitle>
              <CardDescription>
                Rate your experience with {currentTransaction?.is_borrower ? currentTransaction?.owner?.full_name : currentTransaction?.borrower?.full_name}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Rating (Required)</Label>
                <div className="flex space-x-1 mt-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setReviewData(prev => ({...prev, rating: star}))}
                      className="focus:outline-none"
                    >
                      <Star
                        className={`w-8 h-8 ${star <= reviewData.rating ? 'text-yellow-500 fill-current' : 'text-gray-300'}`}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Comment (Optional)</Label>
                <Textarea
                  value={reviewData.comment}
                  onChange={(e) => setReviewData(prev => ({...prev, comment: e.target.value}))}
                  placeholder="Share your experience..."
                />
              </div>
              <div className="flex space-x-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowReviewModal(false);
                    setReviewData({ rating: 5, comment: '' });
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmitReview}
                  className="flex-1 bg-teal-600 hover:bg-teal-700"
                >
                  Submit Review
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

// Chat Page - ENHANCED Implementation
const ChatPage = () => {
  const { transactionId } = useParams();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchMessages();
  }, [transactionId]);

  useEffect(() => {
    const handleNewMessage = (event) => {
      const messageData = event.detail;
      if (messageData.transaction_id === transactionId) {
        setMessages(prev => [...prev, {
          ...messageData.message,
          sender: messageData.sender
        }]);
      }
    };

    window.addEventListener('newMessage', handleNewMessage);
    return () => window.removeEventListener('newMessage', handleNewMessage);
  }, [transactionId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchMessages = async () => {
    try {
      const response = await axios.get(`${API}/chat/${transactionId}/messages`);
      setMessages(response.data);
    } catch (error) {
      toast.error('Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const formData = new FormData();
      formData.append('message', newMessage.trim());

      const response = await axios.post(`${API}/chat/${transactionId}/messages`, formData);
      setMessages(prev => [...prev, response.data]);
      setNewMessage('');
      toast.success('Message sent!');
    } catch (error) {
      console.error('Send message error:', error);
      toast.error(error.response?.data?.detail || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading chat...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto h-[600px] flex flex-col">
      <Card className="flex-1 flex flex-col">
        <CardHeader>
          <CardTitle>Transaction Chat</CardTitle>
          <CardDescription>Private conversation about your transaction</CardDescription>
        </CardHeader>
        
        <CardContent className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto space-y-4 mb-4">
            {messages.map((message, index) => (
              <div
                key={message.id || index}
                className={`flex ${message.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                  message.sender_id === user?.id
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  <p className="text-sm">{message.message}</p>
                  <p className={`text-xs mt-1 ${
                    message.sender_id === user?.id ? 'text-teal-100' : 'text-gray-500'
                  }`}>
                    {message.sender?.full_name} • {new Date(message.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={sendMessage} className="flex space-x-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              disabled={sending}
              className="flex-1"
            />
            <Button 
              type="submit" 
              disabled={sending || !newMessage.trim()}
              className="bg-teal-600 hover:bg-teal-700"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

// Token Management Page - NEW COMPREHENSIVE PAGE
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

      {/* Token Overview */}
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

      {/* Pending Penalties */}
      {pendingPenalties.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              <span>Pending Penalties</span>
            </CardTitle>
            <CardDescription>Pay your pending penalties to improve your account standing</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingPenalties.map(penalty => (
                <div key={penalty.id} className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div>
                    <p className="font-medium text-red-800">{penalty.reason}</p>
                    <p className="text-sm text-red-600">
                      Amount: {penalty.amount} tokens • {new Date(penalty.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    onClick={() => handlePayPenalty(penalty.id)}
                    disabled={user?.tokens < penalty.amount}
                    variant="destructive"
                    size="sm"
                  >
                    {user?.tokens >= penalty.amount ? `Pay ${penalty.amount}` : 'Insufficient Tokens'}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Token History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <History className="w-5 h-5" />
            <span>Token Transaction History</span>
          </CardTitle>
          <CardDescription>View all your token transactions</CardDescription>
        </CardHeader>
        <CardContent>
          {tokenHistory.length === 0 ? (
            <div className="text-center py-8">
              <Coins className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No token transactions yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tokenHistory.map(transaction => (
                <div key={transaction.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${
                      transaction.amount > 0 ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      {transaction.amount > 0 ? (
                        <TrendingUp className={`w-4 h-4 ${transaction.amount > 0 ? 'text-green-600' : 'text-red-600'}`} />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-red-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">{transaction.description}</p>
                      <p className="text-sm text-gray-500">
                        {transaction.transaction_type} • {new Date(transaction.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className={`text-right ${transaction.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    <p className="font-bold">
                      {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                    </p>
                    <p className="text-xs text-gray-500">tokens</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// Complaints Page - NEW COMPREHENSIVE PAGE
const ComplaintsPage = () => {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState({ filed_by_me: [], against_me: [] });
  const [loading, setLoading] = useState(true);
  const [showComplaintModal, setShowComplaintModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [userTransactions, setUserTransactions] = useState([]);
  const [complaintData, setComplaintData] = useState({
    title: '',
    description: '',
    severity: '',
    images: []
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [complaintsResponse, transactionsResponse] = await Promise.all([
        axios.get(`${API}/complaints`),
        axios.get(`${API}/transactions`)
      ]);
      
      setComplaints(complaintsResponse.data);
      setUserTransactions(transactionsResponse.data.filter(t => 
        t.status === 'completed' || t.status === 'returned'
      ));
    } catch (error) {
      toast.error('Failed to load complaints data');
    } finally {
      setLoading(false);
    }
  };

  const handleFileComplaint = async () => {
    if (!selectedTransaction || !complaintData.title || !complaintData.description || !complaintData.severity) {
      toast.error('Please fill all required fields');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('title', complaintData.title);
      formData.append('description', complaintData.description);
      formData.append('severity', complaintData.severity);
      
      if (complaintData.images.length > 0) {
        complaintData.images.forEach(image => formData.append('images', image));
      }

      await axios.post(`${API}/transactions/${selectedTransaction}/complaint`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success('Complaint filed successfully!');
      setShowComplaintModal(false);
      setComplaintData({ title: '', description: '', severity: '', images: [] });
      setSelectedTransaction(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to file complaint');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading complaints...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Complaints</h1>
          <p className="text-gray-600 mt-1">File and manage complaints</p>
        </div>
        <Button
          onClick={() => setShowComplaintModal(true)}
          className="bg-teal-600 hover:bg-teal-700"
        >
          <Flag className="w-4 h-4 mr-2" />
          File Complaint
        </Button>
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
                      <div className="flex items-center space-x-3 mb-3">
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
                        {complaint.is_valid && (
                          <Badge className="bg-green-600">Valid</Badge>
                        )}
                      </div>
                      <p className="text-gray-600 mb-3">{complaint.description}</p>
                      <div className="flex items-center space-x-4 text-sm text-gray-500">
                        <span>Against: {complaint.defendant?.full_name}</span>
                        <span>Item: {complaint.item_title}</span>
                        <span>{new Date(complaint.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div>
                      {complaint.is_resolved ? (
                        <Badge className="bg-gray-600">Resolved</Badge>
                      ) : (
                        <Badge className="bg-blue-600">Pending</Badge>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="against-me" className="space-y-4">
          {complaints.against_me.length === 0 ? (
            <Card className="p-12 text-center">
              <Shield className="w-16 h-16 text-green-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-600 mb-2">No complaints</h3>
              <p className="text-gray-500">Great! No complaints have been filed against you.</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {complaints.against_me.map(complaint => (
                <Card key={complaint.id} className="p-6 border-red-200">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-3">
                        <h4 className="font-semibold text-red-800">{complaint.title}</h4>
                        <Badge 
                          variant="destructive"
                          className={
                            complaint.severity === 'light' ? 'bg-yellow-600' :
                            complaint.severity === 'medium' ? 'bg-orange-600' :
                            complaint.severity === 'high' ? 'bg-red-600' :
                            'bg-red-800'
                          }
                        >
                          {complaint.severity}
                        </Badge>
                        {complaint.is_valid && (
                          <Badge variant="destructive">Valid</Badge>
                        )}
                      </div>
                      <p className="text-gray-600 mb-3">{complaint.description}</p>
                      <div className="flex items-center space-x-4 text-sm text-gray-500">
                        <span>By: {complaint.complainant?.full_name}</span>
                        <span>Item: {complaint.item_title}</span>
                        <span>{new Date(complaint.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div>
                      {complaint.is_resolved ? (
                        <Badge className="bg-gray-600">Resolved</Badge>
                      ) : (
                        <Badge variant="destructive">Active</Badge>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* File Complaint Modal */}
      {showComplaintModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>File a Complaint</CardTitle>
              <CardDescription>Report issues with a transaction</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Select Transaction</Label>
                <Select value={selectedTransaction} onValueChange={setSelectedTransaction}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose transaction" />
                  </SelectTrigger>
                  <SelectContent>
                    {userTransactions.map(transaction => (
                      <SelectItem key={transaction.id} value={transaction.id}>
                        {transaction.is_borrower ? 'Borrowed' : 'Lent'}: {transaction.item?.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Complaint Title</Label>
                <Input
                  value={complaintData.title}
                  onChange={(e) => setComplaintData(prev => ({...prev, title: e.target.value}))}
                  placeholder="Brief title for your complaint"
                />
              </div>

              <div>
                <Label>Severity</Label>
                <Select value={complaintData.severity} onValueChange={(value) => 
                  setComplaintData(prev => ({...prev, severity: value}))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="severe">Severe</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  value={complaintData.description}
                  onChange={(e) => setComplaintData(prev => ({...prev, description: e.target.value}))}
                  placeholder="Detailed description of the issue..."
                  rows={4}
                />
              </div>

              <div>
                <Label>Proof Images (Optional)</Label>
                <Input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => setComplaintData(prev => ({...prev, images: Array.from(e.target.files)}))}
                />
              </div>

              <div className="flex space-x-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowComplaintModal(false);
                    setComplaintData({ title: '', description: '', severity: '', images: [] });
                    setSelectedTransaction(null);
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleFileComplaint}
                  className="flex-1 bg-teal-600 hover:bg-teal-700"
                >
                  File Complaint
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

// Continue with remaining components...
export { TransactionsPage, ChatPage, TokenManagementPage, ComplaintsPage };