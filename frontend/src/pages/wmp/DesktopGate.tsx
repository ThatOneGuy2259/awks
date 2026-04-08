import { useNavigate } from 'react-router-dom';

export function DesktopGate() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-on-surface p-8">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold font-headline mb-4">Windows 7 Media Player mode</h1>
        <p className="text-on-surface-variant mb-8">
          This theme requires a desktop window. Resize your browser to at least 1024 pixels wide, or visit from a desktop to try it.
        </p>
        <button
          onClick={() => navigate('/')}
          className="signature-gradient text-on-primary-fixed font-bold px-8 py-3 rounded-full active:scale-95 transition-transform"
        >
          Back to awks3
        </button>
      </div>
    </div>
  );
}
