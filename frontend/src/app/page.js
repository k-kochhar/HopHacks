'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getRole } from '../lib/localStorage';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Check if user already has a role and redirect accordingly
    const role = getRole();
    if (role === 'organizer') {
      router.push('/admin');
    } else if (role === 'player') {
      router.push('/t/TAG001');
    } else {
      router.push('/join');
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-gray-600">Redirecting...</p>
      </div>
    </div>
  );
}
