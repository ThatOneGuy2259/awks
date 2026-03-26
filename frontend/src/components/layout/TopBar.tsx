import { UserButton } from '@clerk/clerk-react';

export function TopBar() {
  return (
    <header className="fixed top-0 right-0 left-0 lg:left-64 z-50 bg-[#0e0e13]/60 backdrop-blur-xl flex justify-between items-center px-6 py-4">
      <div className="flex items-center gap-2 lg:hidden">
        <span className="text-2xl font-black text-purple-500 tracking-tighter font-headline">AWKS</span>
      </div>
      <div className="hidden lg:block" />

      <div className="flex items-center gap-4">
        <UserButton
          appearance={{
            elements: {
              avatarBox: 'w-10 h-10',
            },
          }}
        />
      </div>
    </header>
  );
}
