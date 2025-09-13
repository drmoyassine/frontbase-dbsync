import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

const LoginPage: React.FC = () => {
  const { login, isAuthenticated, isLoading } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already authenticated
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username || !password) {
      toast.error('Please fill in all fields');
      return;
    }

    setIsSubmitting(true);
    
    try {
      const result = await login(username, password);
      
      if (result.success) {
        toast.success('Login successful!');
      } else {
        toast.error(result.error || 'Login failed');
      }
    } catch (error) {
      toast.error('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Welcome to Frontbase</CardTitle>
          <CardDescription>
            Sign in to your account to continue building amazing websites
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username or Email</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username or email"
                disabled={isSubmitting}
                autoComplete="username"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                disabled={isSubmitting}
                autoComplete="current-password"
              />
            </div>
            
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isSubmitting || isLoading}
            >
              {isSubmitting ? 'Signing In...' : 'Sign In'}
            </Button>
          </form>
          
          <div className="mt-6 text-center text-sm text-muted-foreground">
            <p>Demo credentials:</p>
            <p className="font-mono">Username: admin | Password: admin123</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginPage;