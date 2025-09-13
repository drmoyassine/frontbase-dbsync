import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';

const Index = () => {
  const { isAuthenticated } = useAuthStore();

  // Redirect based on authentication status
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  } else {
    return <Navigate to="/auth/login" replace />;
  }
};

export default Index;
