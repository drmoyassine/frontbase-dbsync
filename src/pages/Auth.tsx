import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LoginForm } from '@/components/auth/LoginForm';
import { RegisterForm } from '@/components/auth/RegisterForm';

const Auth = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [isLoginMode, setIsLoginMode] = useState(location.pathname === '/auth/login');

  // Redirect authenticated users to home
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      {isLoginMode ? (
        <LoginForm onToggleMode={() => setIsLoginMode(false)} />
      ) : (
        <RegisterForm onToggleMode={() => setIsLoginMode(true)} />
      )}
    </div>
  );
};

export default Auth;