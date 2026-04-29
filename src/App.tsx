import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { LogIn, LogOut, Shield, Newspaper, MessageSquare, AlertCircle, Plus, Trash2, Edit3, Settings, Moon, Sun, Menu, X, ChevronRight, Search, Bell, Sparkles, Wand2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { generatePostContent, refineContent } from './lib/gemini.ts';
import { signInWithPopup, GoogleAuthProvider, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, updateDoc, where, getDocs, limit } from 'firebase/firestore';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import { cn } from './lib/utils';

// --- Types ---
type View = 'feed' | 'post-detail' | 'admin' | 'moderation' | 'profile';

interface Post {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  content: string;
  category: 'news' | 'daily' | 'general';
  createdAt: any;
  updatedAt?: any;
}

interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: any;
}

interface Report {
  id: string;
  itemId: string;
  itemType: 'post' | 'comment';
  reporterId: string;
  reason: string;
  status: 'pending' | 'resolved';
  createdAt: any;
  contentSnapshot?: string;
}

// --- Components ---

const Navbar = ({ onViewChange, currentView, isAdmin, isModerator, theme, toggleTheme }: { 
  onViewChange: (v: View) => void, 
  currentView: View, 
  isAdmin: boolean, 
  isModerator: boolean,
  theme: 'light' | 'dark',
  toggleTheme: () => void 
}) => {
  const { user, profile } = useAuth();

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-border glass">
      <div className="container flex h-16 items-center px-4 md:px-8">
        <div className="flex gap-6 md:gap-10">
          <button 
            onClick={() => onViewChange('feed')}
            className="flex items-center space-x-2 transition-transform hover:scale-105"
          >
            <div className="bg-primary/5 p-1.5 rounded-lg border border-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <span className="inline-block font-black text-xl tracking-tight hidden sm:inline-block">NEXUS</span>
          </button>
          <div className="hidden md:flex gap-8">
            {(['feed', 'admin', 'moderation'] as const).map((v) => {
              if (v === 'admin' && !isAdmin) return null;
              if (v === 'moderation' && !isModerator) return null;
              return (
                <button 
                  key={v}
                  onClick={() => onViewChange(v as View)}
                  className={cn(
                    "relative flex items-center text-[10px] font-black uppercase tracking-[0.2em] transition-colors py-2",
                    currentView === v ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {v}
                  {currentView === v && (
                    <motion.div layoutId="nav-line" className="absolute bottom-[-20px] left-0 right-0 h-0.5 bg-primary rounded-full shadow-[0_0_10px_rgba(37,99,235,0.5)]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-1 items-center justify-end space-x-4">
          <div className="flex items-center space-x-3">
            <button
              onClick={toggleTheme}
              className="p-2 h-9 w-9 rounded-full border border-border bg-card/50 hover:bg-accent transition-all flex items-center justify-center"
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            {user ? (
              <div className="flex items-center gap-4 pl-4 border-l">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-xs font-bold tracking-tight leading-none">{profile?.displayName}</span>
                  <span className="text-[10px] font-medium text-primary mt-1 uppercase tracking-wider">{profile?.role}</span>
                </div>
                <button 
                  onClick={() => signOut(auth)}
                  className="p-2 h-9 w-9 rounded-full border border-border hover:bg-destructive hover:text-destructive-foreground transition-all flex items-center justify-center"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </nav>
  );
};

const AuthScreen = () => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isRegister) {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        await addDoc(collection(db, 'users'), {
          uid: userCred.user.uid,
          email,
          displayName: displayName || email.split('@')[0],
          role: 'employee',
          createdAt: serverTimestamp(),
          isBanned: false
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      // Check if user exists in our users collection
      const userRef = collection(db, 'users');
      const q = query(userRef, where('uid', '==', result.user.uid));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        await addDoc(collection(db, 'users'), {
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName,
          role: 'employee',
          createdAt: serverTimestamp(),
          isBanned: false
        });
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 selection:bg-primary/20 font-sans bg-background">
      <div className="relative hidden lg:flex flex-col items-center justify-center p-12 bg-[#0a0b10] overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[80px]" />
        
        <div className="relative z-10 space-y-12 text-center">
           <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="inline-flex p-5 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-2xl shadow-2xl mb-8"
          >
            <Shield className="h-16 w-16 text-primary" />
          </motion.div>
          <div className="space-y-6">
            <h1 className="text-7xl font-black tracking-tight leading-none text-white italic">
              NEXUS <br/><span className="text-primary not-italic">PORTAL</span>
            </h1>
            <div className="h-0.5 w-16 bg-primary mx-auto" />
            <p className="text-xl text-slate-300 max-w-sm mx-auto leading-relaxed font-light">
              Elevating internal communications with precision and speed.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-8 bg-background relative">
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-full max-w-md space-y-12 relative z-10"
        >
          <div className="space-y-3">
            <h2 className="text-3xl font-black tracking-tight">{isRegister ? 'Join the Network' : 'Welcome Back'}</h2>
            <p className="text-muted-foreground font-medium">{isRegister ? 'Create your internal employee profile.' : 'Sign in to access your dashboard.'}</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-6">
            {isRegister && (
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Display Name</label>
                <input 
                  type="text" 
                  placeholder="John Doe" 
                  value={displayName} 
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full p-4 bg-card border rounded-xl outline-none focus:border-primary transition-all font-medium"
                  required 
                />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Email Address</label>
              <input 
                type="email" 
                placeholder="name@nexus.com" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-4 bg-card border rounded-xl outline-none focus:border-primary transition-all font-medium"
                required 
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Password</label>
              <input 
                type="password" 
                placeholder="••••••••" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-4 bg-card border rounded-xl outline-none focus:border-primary transition-all font-medium"
                required 
              />
            </div>

            {error && <p className="text-xs text-destructive text-center font-bold bg-destructive/5 p-4 rounded-xl border border-destructive/10">{error}</p>}

            <button 
              type="submit" 
              className="w-full py-4 bg-primary text-primary-foreground font-bold rounded-xl shadow-lg shadow-primary/25 hover:opacity-90 transition-all active:scale-95"
            >
              {isRegister ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border"></div></div>
            <div className="relative flex justify-center text-[10px] font-bold uppercase tracking-widest"><span className="bg-background px-4 text-muted-foreground">Trusted Auth Only</span></div>
          </div>

          <button 
            onClick={handleGoogle}
            className="w-full py-4 border border-border rounded-xl font-bold bg-card hover:bg-accent transition-all flex items-center justify-center gap-3 active:scale-95"
          >
             Sign in with Google
          </button>

          <p className="text-center text-sm">
            {isRegister ? "Already have an account?" : "Need an account?"}
            <button 
              onClick={() => setIsRegister(!isRegister)} 
              className="ml-2 text-primary font-bold hover:underline"
            >
              {isRegister ? 'Log In' : 'Sign Up'}
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

const PostComposer = ({ onClose }: { onClose: () => void }) => {
  const { user, profile } = useAuth();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<'news' | 'daily' | 'general'>('general');
  const [loading, setLoading] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const handleAiDraft = async () => {
    if (!title) {
      alert("Please enter a title first so AI knows what to write about!");
      return;
    }
    setIsAiLoading(true);
    try {
      const generated = await generatePostContent(title, category);
      if (generated) setContent(generated);
    } catch (err) {
      alert("AI drafting failed. Please try again.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleAiRefine = async () => {
    if (!content) return;
    setIsAiLoading(true);
    try {
      const refined = await refineContent(content);
      if (refined) setContent(refined);
    } catch (err) {
      alert("AI refinement failed.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'posts'), {
        title,
        content,
        category,
        authorId: user.uid,
        authorName: profile.displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'posts');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-card border rounded-lg p-8 shadow-2xl relative overflow-hidden"
    >
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center border border-primary/20">
            <Wand2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Create Post</h2>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest opacity-60">Share an update with the team</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-accent rounded-full transition-colors"><X className="h-5 w-5" /></button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b pb-8">
          <div className="space-y-3 flex-1">
             <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/60">Category Selection</label>
             <div className="flex gap-2">
              {(['news', 'daily', 'general'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all",
                    category === cat ? "bg-primary text-primary-foreground border-primary" : "bg-transparent text-muted-foreground hover:border-primary"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex gap-3">
             <button
              type="button"
              onClick={handleAiDraft}
              disabled={isAiLoading || !title}
              className="flex items-center gap-2 px-4 py-2 bg-primary/5 hover:bg-primary/10 text-primary border border-primary/20 rounded-full font-bold uppercase tracking-widest text-[10px] transition-all disabled:opacity-50"
            >
              <Sparkles className={cn("h-3 w-3", isAiLoading && "animate-pulse")} />
              AI Draft
            </button>
            {content && (
              <button
                type="button"
                onClick={handleAiRefine}
                disabled={isAiLoading}
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/80 text-foreground border border-border rounded-full font-bold uppercase tracking-widest text-[10px] transition-all disabled:opacity-50"
              >
                <RefreshCw className={cn("h-3 w-3", isAiLoading && "animate-spin")} />
                AI Refine
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/60">Headline</label>
          <input 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's happening?"
            className="w-full text-4xl font-bold bg-transparent outline-none placeholder:opacity-20 tracking-tight"
            autoFocus
          />
        </div>

        <div className="relative space-y-3">
          <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/60">Content</label>
          <textarea 
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your update here..."
            className="w-full min-h-[300px] bg-transparent outline-none resize-none placeholder:opacity-30 text-xl leading-relaxed font-medium"
          />
          {isAiLoading && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-[2px] flex items-center justify-center rounded-xl border border-primary/10">
              <div className="flex flex-col items-center gap-4">
                <div className="h-12 w-12 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] animate-pulse text-primary">Gemini is writing...</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-4 mt-8 border-t pt-8">
          <button type="button" onClick={onClose} className="px-6 py-3 text-xs font-bold uppercase tracking-widest hover:bg-accent rounded-xl transition-colors">Cancel</button>
          <button 
            type="submit" 
            disabled={loading || isAiLoading || !title || !content}
            className="px-10 py-3 bg-primary text-primary-foreground font-bold uppercase tracking-widest text-xs rounded-xl shadow-xl shadow-primary/20 disabled:opacity-50 transition-all hover:-translate-y-0.5 active:scale-95"
          >
            Publish update
          </button>
        </div>
      </form>
    </motion.div>
  );
};

const PostCard = ({ post, onSelect, onReport }: { post: Post, onSelect: () => void, onReport: () => void }) => {
  const { user, profile, isModerator } = useAuth();

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this post?')) {
      try {
        await deleteDoc(doc(db, 'posts', post.id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `posts/${post.id}`);
      }
    }
  };

  return (
    <motion.div 
      layout
      onClick={onSelect}
      className="group relative bg-card border rounded-lg p-6 hover:border-primary transition-all cursor-pointer shadow-sm hover:shadow-xl hover:shadow-primary/5"
    >
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/5 flex items-center justify-center border border-primary/10 group-hover:bg-primary/10 transition-colors">
            <span className="text-xs font-bold text-primary">{post.authorName[0].toUpperCase()}</span>
          </div>
          <div>
            <h4 className="font-bold text-sm tracking-tight">{post.authorName}</h4>
            <p className="text-[10px] font-medium text-muted-foreground uppercase mt-0.5 tracking-wider">
              {post.createdAt?.toDate ? format(post.createdAt.toDate(), 'MMM d, yyyy') : 'Recently'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {(post.authorId === user?.uid || isModerator) && (
            <button onClick={handleDelete} className="p-2 hover:bg-destructive/10 text-destructive rounded-full transition-colors"><Trash2 className="h-4 w-4" /></button>
          )}
          <button onClick={(e) => { e.stopPropagation(); onReport(); }} className="p-2 hover:bg-accent rounded-full text-muted-foreground transition-colors"><AlertCircle className="h-4 w-4" /></button>
        </div>
      </div>
      
      <div className="space-y-4">
        <div className="flex items-center gap-2">
           <span className={cn(
            "px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest border",
            post.category === 'news' ? "bg-blue-500/10 text-blue-600 border-blue-500/20" : 
            post.category === 'daily' ? "bg-green-500/10 text-green-600 border-green-500/20" : "bg-primary/10 text-primary border-primary/20"
          )}>
            {post.category}
          </span>
          <div className="h-px flex-1 bg-border/50 group-hover:bg-primary/10 transition-colors" />
        </div>
        
        <h3 className="text-xl font-bold tracking-tight leading-tight group-hover:text-primary transition-colors">{post.title}</h3>
        <p className="text-muted-foreground text-sm line-clamp-3 leading-relaxed">
          {post.content}
        </p>
      </div>
      
      <div className="mt-8 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-t pt-4">
        <div className="flex items-center gap-2 group-hover:text-primary transition-colors">
          <MessageSquare className="h-3.5 w-3.5" />
          <span>View Discussion</span>
        </div>
        <div className="flex items-center gap-1 group-hover:text-primary transition-colors">
          Read Article <ChevronRight className="h-3.5 w-3.5" />
        </div>
      </div>
    </motion.div>
  );
};

const PostDetail = ({ post, onBack }: { post: Post, onBack: () => void }) => {
  const { user, profile } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'posts', post.id, 'comments'), orderBy('createdAt', 'asc'));
    return onSnapshot(q, (snapshot) => {
      setComments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Comment)));
    }, (error) => {
      console.error("Comments listener error:", error);
    });
  }, [post.id]);

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !newComment.trim()) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'posts', post.id, 'comments'), {
        authorId: user.uid,
        authorName: profile.displayName,
        content: newComment,
        postId: post.id,
        createdAt: serverTimestamp(),
      });
      setNewComment('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'comments');
    } finally {
      setLoading(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    if (confirm('Delete comment?')) {
      await deleteDoc(doc(db, 'posts', post.id, 'comments', commentId));
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="py-12 max-w-5xl mx-auto"
    >
      <button onClick={onBack} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-all mb-12 group">
        <ChevronRight className="h-4 w-4 rotate-180 transition-transform group-hover:-translate-x-1" /> Back to Feed
      </button>
 
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
        <div className="lg:col-span-8 space-y-12">
          <header className="space-y-8">
            <div className="flex items-center gap-4">
              <span className={cn(
                "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border",
                post.category === 'news' ? "bg-blue-500/5 text-blue-500 border-blue-500/20" : 
                post.category === 'daily' ? "bg-green-500/5 text-green-500 border-green-500/20" : "bg-primary/5 text-primary border-primary/20"
              )}>
                {post.category}
              </span>
              <div className="h-px flex-1 bg-border/50" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight">{post.title}</h1>
            <div className="flex items-center gap-6 p-6 rounded-2xl bg-card border shadow-sm">
              <div className="h-12 w-12 rounded-full bg-primary/5 flex items-center justify-center border border-primary/10">
                <span className="text-sm font-bold text-primary">{post.authorName[0].toUpperCase()}</span>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold tracking-tight">{post.authorName}</p>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Internal Member</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Published</p>
                <p className="text-xs font-bold tabular-nums">{post.createdAt?.toDate ? format(post.createdAt.toDate(), 'MMMM d, yyyy') : 'Just now'}</p>
              </div>
            </div>
          </header>
 
          <article className="prose dark:prose-invert max-w-none">
            <p className="text-xl leading-relaxed text-foreground/90 font-medium whitespace-pre-wrap">{post.content}</p>
          </article>
 
          <section className="pt-12 border-t space-y-8">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] flex items-center gap-3">
                <MessageSquare className="h-4 w-4 text-primary" /> Conversation
              </h3>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{comments.length} Comments</span>
            </div>
 
            <form onSubmit={handleComment} className="space-y-4">
              <textarea 
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Join the discussion..."
                className="w-full min-h-[140px] p-6 bg-card border rounded-2xl outline-none focus:border-primary transition-all font-medium text-md shadow-sm"
              />
              <div className="flex justify-end">
                <button 
                  disabled={loading || !newComment.trim()}
                  className="px-10 py-3 bg-primary text-primary-foreground font-bold uppercase tracking-widest text-[10px] rounded-xl hover:opacity-90 shadow-lg shadow-primary/20 disabled:opacity-50 transition-all hover:-translate-y-0.5 active:scale-95"
                >
                  Post Comment
                </button>
              </div>
            </form>
 
            <div className="space-y-6">
              {comments.map((c) => (
                <div key={c.id} className="p-6 rounded-2xl bg-card border relative group shadow-sm">
                  <div className="flex justify-between mb-4">
                    <span className="text-[10px] font-bold text-primary uppercase tracking-widest">{c.authorName}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-tighter">{c.createdAt?.toDate ? format(c.createdAt.toDate(), 'p') : 'Just now'}</span>
                      {c.authorId === user?.uid && (
                        <button onClick={() => deleteComment(c.id)} className="p-1 hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                  </div>
                  <p className="text-md leading-relaxed font-medium">{c.content}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
 
        <div className="lg:col-span-4 space-y-8">
          <div className="glass p-8 rounded-3xl space-y-8 shadow-xl">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Post Details</h4>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Post ID</span>
                <span className="text-[10px] font-mono font-bold opacity-40">{post.id.toUpperCase().slice(0, 8)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Status</span>
                <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-tight">
                  <div className="h-1.5 w-1.5 rounded-full bg-green-500" /> Active
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Visibility</span>
                <span className="text-[10px] font-bold uppercase tracking-tight">Internal Only</span>
              </div>
            </div>
            <div className="p-6 bg-primary/5 rounded-2xl border border-primary/10 flex items-center justify-center">
               <Shield className="h-12 w-12 text-primary/20" />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const AdminPanel = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    };
    fetchUsers();
  }, []);

  const updateRole = async (userId: string, newRole: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err) {
      alert("Only system admins can modify roles via backend console or this panel if permissions are right.");
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-12 px-4 space-y-12">
      <div className="space-y-4">
        <h1 className="text-4xl font-black tracking-tight uppercase">Team Management</h1>
        <p className="text-muted-foreground text-lg font-medium">Oversee organizational workspace and access levels.</p>
      </div>

      <div className="bg-card border rounded-3xl overflow-hidden shadow-2xl premium-shadow">
        <table className="w-full text-left">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Identity</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Authentication</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Registry Date</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] opacity-60 text-right">Access Level</th>
            </tr>
          </thead>
          <tbody className="divide-y border-border/50">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-muted/20 transition-colors group">
                <td className="px-8 py-6">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/5 border border-primary/10 flex items-center justify-center font-bold text-primary group-hover:bg-primary/10 transition-colors">{u.displayName?.[0]}</div>
                    <span className="font-bold tracking-tight">{u.displayName}</span>
                  </div>
                </td>
                <td className="px-8 py-6 text-sm text-muted-foreground font-medium">{u.email}</td>
                <td className="px-8 py-6 text-[11px] text-muted-foreground font-bold uppercase tracking-wider">
                  {u.createdAt?.toDate ? format(u.createdAt.toDate(), 'MMMM d, yyyy') : '-'}
                </td>
                <td className="px-8 py-6 text-right">
                  <select 
                    value={u.role} 
                    onChange={(e) => updateRole(u.id, e.target.value)}
                    className="bg-accent/50 text-[10px] font-black uppercase py-2 px-4 rounded-xl outline-none focus:ring-2 ring-primary/20 appearance-none text-center cursor-pointer transition-all border border-transparent hover:border-border"
                  >
                    <option value="user">Employee</option>
                    <option value="moderator">Lead</option>
                    <option value="admin">System_Admin</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ModerationPanel = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'reports'), where('status', '==', 'pending'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() } as Report)));
      setLoading(false);
    }, (error) => {
      console.error("Reports listener error:", error);
      setLoading(false);
    });
  }, []);

  const resolveReport = async (reportId: string) => {
    await updateDoc(doc(db, 'reports', reportId), { status: 'resolved' });
  };

  const deleteContent = async (report: Report) => {
    if (confirm('Delete reported content?')) {
      if (report.itemType === 'post') {
        await deleteDoc(doc(db, 'posts', report.itemId));
      }
      await resolveReport(report.id);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Content Moderation</h1>
        <p className="text-muted-foreground text-lg">Review community reports and enforce platform guidelines.</p>
      </div>

      {reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 bg-muted/20 border border-dashed rounded-3xl space-y-4">
          <Shield className="h-12 w-12 text-muted-foreground opacity-20" />
          <p className="text-muted-foreground font-medium">All clear! No pending reports found.</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {reports.map((report) => (
            <motion.div layout key={report.id} className="bg-card border rounded-2xl p-6 shadow-lg space-y-4">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="bg-amber-500/10 p-2 rounded-xl"><AlertCircle className="h-6 w-6 text-amber-500" /></div>
                  <div>
                    <h3 className="font-bold flex items-center gap-2">
                      Inappropriate {report.itemType}
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded uppercase">{report.status}</span>
                    </h3>
                    <p className="text-xs text-muted-foreground">Reported by ID: {report.reporterId.slice(0,8)}... at {report.createdAt?.toDate ? format(report.createdAt.toDate(), 'p') : ''}</p>
                  </div>
                </div>
              </div>
              <div className="bg-muted/50 p-4 rounded-xl text-sm italic font-medium border-l-4 border-amber-500">
                "{report.reason}"
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button onClick={() => resolveReport(report.id)} className="px-4 py-2 text-sm font-semibold hover:bg-accent rounded-lg transition-colors">Dismiss</button>
                <button onClick={() => deleteContent(report)} className="px-4 py-2 text-sm font-semibold bg-destructive text-destructive-foreground rounded-lg hover:opacity-90 transition-all">Remove Content</button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

const ReportModal = ({ itemId, itemType, onClose }: { itemId: string, itemType: 'post' | 'comment', onClose: () => void }) => {
  const { user } = useAuth();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !reason.trim()) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'reports'), {
        itemId,
        itemType,
        reporterId: user.uid,
        reason,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      alert('Report submitted successfully. Content will be reviewed by moderators.');
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'reports');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-card border rounded-3xl p-8 shadow-2xl relative"
      >
        <button onClick={onClose} className="absolute top-6 right-6 p-1 hover:bg-accent rounded-full"><X className="h-5 w-5" /></button>
        <div className="space-y-4">
          <div className="bg-destructive/10 p-3 w-fit rounded-2xl"><AlertCircle className="h-6 w-6 text-destructive" /></div>
          <h2 className="text-2xl font-bold">Report Content</h2>
          <p className="text-muted-foreground text-sm">Please tell us why this content should be removed. Moderators will review your report shortly.</p>
          <form onSubmit={handleSubmit} className="space-y-6 pt-2">
            <textarea 
              autoFocus
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Spam, harassment, inappropriate content..."
              className="w-full h-32 bg-muted/30 border rounded-2xl p-4 outline-none focus:ring-2 focus:ring-destructive/20 resize-none transition-all"
            />
            <button 
              disabled={submitting || !reason.trim()}
              className="w-full py-3 bg-destructive text-destructive-foreground font-bold rounded-2xl hover:opacity-90 disabled:opacity-50 transition-all shadow-lg"
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

// --- Portal Root ---

function PortalContent() {
  const { user, profile, isAdmin, isModerator } = useAuth();
  const [view, setView] = useState<View>('feed');
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [isComposing, setIsComposing] = useState(false);
  const [reportItem, setReportItem] = useState<{ id: string, type: 'post' | 'comment' } | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(q, (snapshot) => {
      setPosts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Post)));
    }, (error) => {
      console.error("Posts listener error:", error);
    });
  }, []);

  if (!user) return <AuthScreen />;

  const filteredPosts = posts.filter(p => 
    (p.title.toLowerCase().includes(searchQuery.toLowerCase()) || p.content.toLowerCase().includes(searchQuery.toLowerCase())) &&
    (!categoryFilter || p.category === categoryFilter)
  );

  return (
    <div className={cn(
      "min-h-screen bg-background text-foreground transition-colors duration-500 font-sans selection:bg-primary/20",
      theme === 'dark' ? "" : ""
    )}>
      <Navbar 
        onViewChange={(v) => { setView(v); setSelectedPost(null); }} 
        currentView={view}
        isAdmin={isAdmin} 
        isModerator={isModerator}
        theme={theme}
        toggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      />

      <main className="container mx-auto px-4 md:px-8 max-w-7xl">
        <AnimatePresence mode="wait">
          {view === 'feed' && !selectedPost && (
            <motion.div 
              key="feed"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="py-12 space-y-12"
            >
              <header className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-border pb-12">
                <div className="space-y-6 max-w-2xl">
                  <div className="inline-flex items-center gap-3 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-[10px] font-bold uppercase tracking-widest">
                    <Bell className="h-3 w-3" /> Network Active
                  </div>
                  <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-none uppercase italic">
                    Nexus <span className="text-primary not-italic">Portal.</span>
                  </h1>
                  <p className="text-lg text-muted-foreground font-medium leading-relaxed max-w-lg">
                    Real-time internal synchronization for Nexus Industries teams and regional units.
                  </p>
                </div>
                {!isComposing && (
                  <button 
                    onClick={() => setIsComposing(true)}
                    className="flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-xl font-bold uppercase tracking-widest text-[10px] hover:-translate-y-1 active:translate-y-0.5 transition-all shadow-xl shadow-primary/20 hover:shadow-primary/30"
                  >
                    <Plus className="h-4 w-4" /> Create Update
                  </button>
                )}
              </header>

              <div className="flex flex-col md:flex-row gap-6 items-center justify-between glass p-2 rounded-2xl">
                 <div className="relative w-full md:w-96 group">
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <input 
                    type="text" 
                    placeholder="Search communications..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-transparent border-transparent focus:ring-0 outline-none text-sm font-bold tracking-tight"
                  />
                </div>
                <div className="flex gap-2 p-1 bg-muted/40 rounded-xl w-full md:w-auto overflow-x-auto scrollbar-hide">
                  {['all', 'news', 'daily', 'general'].map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategoryFilter(c === 'all' ? null : c)}
                      className={cn(
                        "px-5 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest whitespace-nowrap transition-all",
                        (categoryFilter === c || (c === 'all' && !categoryFilter)) 
                        ? "bg-card text-foreground shadow-sm font-black" 
                        : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {isComposing && (
                <div className="max-w-4xl mx-auto">
                  <PostComposer onClose={() => setIsComposing(false)} />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredPosts.map((post) => (
                  <PostCard 
                    key={post.id} 
                    post={post} 
                    onSelect={() => setSelectedPost(post)} 
                    onReport={() => setReportItem({ id: post.id, type: 'post' })}
                  />
                ))}
              </div>
              
              {filteredPosts.length === 0 && !isComposing && (
                <div className="text-center py-32 border border-dashed rounded-lg space-y-4">
                  <div className="h-12 w-12 bg-muted rounded-full flex items-center justify-center mx-auto opacity-20">
                    <Search className="h-6 w-6" />
                  </div>
                  <p className="text-muted-foreground font-mono text-xs uppercase tracking-widest">0 results found for current query_</p>
                </div>
              )}
            </motion.div>
          )}

          {selectedPost && (
            <PostDetail post={selectedPost} onBack={() => setSelectedPost(null)} />
          )}

          {view === 'admin' && <AdminPanel />}
          {view === 'moderation' && <ModerationPanel />}
        </AnimatePresence>
      </main>

      {reportItem && (
        <ReportModal 
          itemId={reportItem.id} 
          itemType={reportItem.type} 
          onClose={() => setReportItem(null)} 
        />
      )}

      <footer className="mt-32 border-t py-16 bg-card/10">
        <div className="container mx-auto px-8 max-w-7xl">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-3">
              <Shield className="h-6 w-6 text-primary" />
              <span className="font-black tracking-[0.3em] text-sm uppercase">Nexus_Core</span>
            </div>
            <div className="flex flex-wrap justify-center gap-8 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              <a href="#" className="hover:text-primary transition-colors">Privacy_Protocol</a>
              <a href="#" className="hover:text-primary transition-colors">Security_Layers</a>
              <a href="#" className="hover:text-primary transition-colors">Global_Sync</a>
            </div>
            <p className="text-[10px] font-mono text-muted-foreground uppercase">© {new Date().getFullYear()} NEXUS.ALL_SYSTEMS_OPERATIONAL</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PortalContent />
    </AuthProvider>
  );
}
