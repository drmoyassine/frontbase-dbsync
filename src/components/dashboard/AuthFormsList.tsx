import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, Code, FileKey } from 'lucide-react';
import { useAuthForms } from '@/hooks/useAuthForms';
import { AuthFormBuilder } from './AuthFormBuilder';
import { EmbedCodeDialog } from './EmbedCodeDialog';
import { AuthForm } from '@/types/auth-form';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

export function AuthFormsList() {
    const { forms, loading, createForm, updateForm, deleteForm } = useAuthForms();
    const [editingForm, setEditingForm] = useState<AuthForm | null>(null);
    const [isBuilderOpen, setIsBuilderOpen] = useState(false);
    const [embedForm, setEmbedForm] = useState<AuthForm | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);

    const handleCreate = () => {
        setEditingForm(null);
        setIsBuilderOpen(true);
    };

    const handleEdit = (form: AuthForm) => {
        setEditingForm(form);
        setIsBuilderOpen(true);
    };

    const handleSave = async (data: Partial<AuthForm>) => {
        if (editingForm) {
            await updateForm(editingForm.id, data);
        } else {
            await createForm(data);
        }
    };

    const handleDelete = async () => {
        if (deleteId) {
            await deleteForm(deleteId);
            setDeleteId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-medium">Authentication Forms</h3>
                    <p className="text-sm text-muted-foreground">
                        Create embeddable login and signup forms for your users.
                    </p>
                </div>
                <Button onClick={handleCreate}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Form
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {forms.map(form => (
                    <Card key={form.id} className="hover:border-slate-400 transition-colors">
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
                                <Button variant="outline" size="sm" onClick={() => setEmbedForm(form)}>
                                    <Code className="h-3.5 w-3.5 mr-1" />
                                    Embed
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleEdit(form)}>
                                    <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(form.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {forms.length === 0 && !loading && (
                    <div className="col-span-full border-2 border-dashed rounded-lg p-12 flex flex-col items-center justify-center text-muted-foreground">
                        <FileKey className="h-10 w-10 mb-4 opacity-50" />
                        <p>No forms created yet.</p>
                        <Button variant="link" onClick={handleCreate}>Create your first form</Button>
                    </div>
                )}
            </div>

            <AuthFormBuilder
                form={editingForm}
                open={isBuilderOpen}
                onOpenChange={setIsBuilderOpen}
                onSave={handleSave}
            />

            <EmbedCodeDialog
                form={embedForm}
                open={!!embedForm}
                onOpenChange={(open) => !open && setEmbedForm(null)}
            />

            <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. Any websites embedding this form will stop working.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div >
    );
}
