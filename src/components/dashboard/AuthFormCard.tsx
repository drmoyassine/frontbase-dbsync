
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2, Code, FileKey } from 'lucide-react';
import { AuthForm } from '@/types/auth-form';

interface AuthFormCardProps {
    form: AuthForm;
    onEdit: (form: AuthForm) => void;
    onDelete: (id: string) => void;
    onEmbed: (form: AuthForm) => void;
}

export function AuthFormCard({ form, onEdit, onDelete, onEmbed }: AuthFormCardProps) {
    return (
        <Card className="hover:border-slate-400 transition-colors">
            <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                    <CardTitle className="text-base flex items-center gap-2">
                        <FileKey className="h-4 w-4 text-blue-500" />
                        {form.name}
                    </CardTitle>
                    <div className="flex gap-1">
                        {form.isActive && <Badge variant="secondary" className="text-xs">Active</Badge>}
                        <Badge variant="outline" className="text-xs uppercase">{form.type}</Badge>
                    </div>
                </div>
                <CardDescription className="text-xs truncate">
                    {form.type === 'signup' && form.targetContactType
                        ? `Assigns: ${form.targetContactType}`
                        : 'Standard Login'}
                </CardDescription>

                <div className="flex flex-wrap gap-2 mt-2">
                    {/* Contact Types Badge */}
                    {form.type !== 'login' && (
                        <>
                            {(form.allowedContactTypes || (form.targetContactType ? [form.targetContactType] : [])).map(type => (
                                <Badge key={type} variant="secondary" className="text-[10px] px-1.5 h-5 font-normal border-slate-200">
                                    {type}
                                </Badge>
                            ))}
                        </>
                    )}

                    {/* Social Provider Badges */}
                    {form.config.providers?.map(pid => (
                        <Badge key={pid} variant="outline" className="text-[10px] px-1.5 h-5 font-normal bg-slate-50">
                            {pid}
                        </Badge>
                    ))}

                    {/* Magic Link Badge */}
                    {form.config.magicLink && (
                        <Badge variant="outline" className="text-[10px] px-1.5 h-5 font-normal border-purple-200 text-purple-700 bg-purple-50">
                            Magic Link
                        </Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={() => onEmbed(form)}>
                        <Code className="h-3.5 w-3.5 mr-1" />
                        Embed
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onEdit(form)}>
                        <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => onDelete(form.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
