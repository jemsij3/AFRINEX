import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './lib/auth-context.tsx';
import { AssistantPage } from './pages/AssistantPage.tsx';
import './index.css';

const root = createRoot(document.getElementById('root')!);
if (window.location.pathname === '/assistant') {
  root.render(<AuthProvider><AssistantPage onNavigate={() => { window.history.pushState({}, '', '/'); window.location.reload(); }} /></AuthProvider>);
} else {
  root.render(<App />);
}
