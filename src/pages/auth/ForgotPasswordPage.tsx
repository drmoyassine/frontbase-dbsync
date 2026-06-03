import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isCloud } from '@/lib/edition';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert, CheckCircle2 } from 'lucide-react';



export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [warningMessage, setWarningMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [devLink, setDevLink] = useState<string | null>(null);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setSuccessMessage(null);
        setWarningMessage(null);
        setErrorMessage(null);
        setDevLink(null);

        try {
            if (isCloud()) {
                // Cloud mode: SuperTokens password reset token API
                const response = await fetch(`/api/auth/user/password/reset/token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        formFields: [{ id: 'email', value: email }]
                    })
                });
                
                const data = await response.json();
                if (!response.ok || data.status !== 'OK') {
                    const detail = data.formFields?.[0]?.error || 'Failed to send reset link';
                    setErrorMessage(detail);
                } else {
                    setSuccessMessage('A password reset link has been sent to your email.');
                }
            } else {
                // Self-Hosted mode: custom forgot-password API
                const response = await fetch(`/api/auth/forgot-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });

                const data = await response.json();
                if (!response.ok) {
                    setErrorMessage(data.detail || 'Failed to request password reset');
                } else if (data.success === false && data.error_code === 'NO_EMAIL_PROVIDER') {
                    // No email provider is configured
                    setWarningMessage(data.message || 'No email provider is configured on this instance.');
                    if (data.dev_link) {
                        setDevLink(data.dev_link);
                    }
                } else {
                    setSuccessMessage(data.message || 'A password reset link has been sent to your email.');
                }
            }
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : 'Network error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDevBypass = () => {
        if (devLink) {
            // devLink format: http://host/reset-password?token=XXX&email=YYY
            // extract query parameters and navigate locally
            try {
                const url = new URL(devLink);
                const token = url.searchParams.get('token');
                const emailParam = url.searchParams.get('email');
                navigate(`/reset-password?token=${token}&email=${emailParam}`);
            } catch {
                setErrorMessage('Failed to parse dev link');
            }
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl font-bold">Reset Password</CardTitle>
                    <CardDescription>
                        Enter your email address to request a reset link
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {errorMessage && (
                            <Alert variant="destructive">
                                <AlertDescription>{errorMessage}</AlertDescription>
                            </Alert>
                        )}

                        {successMessage && (
                            <Alert variant="default" className="border-green-500/20 bg-green-500/5 text-green-600 dark:text-green-400">
                                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                                <AlertTitle>Success</AlertTitle>
                                <AlertDescription>{successMessage}</AlertDescription>
                            </Alert>
                        )}

                        {warningMessage && (
                            <Alert variant="default" className="border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400">
                                <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                <AlertTitle>Warning</AlertTitle>
                                <AlertDescription className="space-y-3">
                                    <p>{warningMessage}</p>
                                    {devLink && (
                                        <div className="pt-2">
                                            <p className="text-xs text-muted-foreground pb-2">
                                                [Development Mode] A reset link has been printed to the server console. You can also bypass email sending and reset directly using the button below:
                                            </p>
                                            <Button type="button" variant="outline" size="sm" onClick={handleDevBypass} className="w-full">
                                                Reset Password Directly
                                            </Button>
                                        </div>
                                    )}
                                </AlertDescription>
                            </Alert>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="admin@frontbase.dev"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoComplete="email"
                                disabled={isLoading || !!successMessage}
                            />
                        </div>

                        {!successMessage && (
                            <Button type="submit" className="w-full" disabled={isLoading}>
                                {isLoading ? 'Sending Link...' : 'Send Reset Link'}
                            </Button>
                        )}

                        <p className="text-center text-sm text-muted-foreground pt-2">
                            Back to{' '}
                            <Link to="/login" className="text-primary hover:underline font-medium">
                                Sign In
                            </Link>
                        </p>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
