import './App.css';
import { Upload } from './page/pages/upload';
import { Toaster } from "sonner";

function App() {
  return (
    <div className='p-5 bg-slate-50 rounded-lg'>
      <Upload />
      <Toaster position="top-right" richColors />
    </div>
  );
}

export default App
