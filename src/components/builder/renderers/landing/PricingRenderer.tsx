import React from 'react';
import { cn } from '@/lib/utils';
import { RendererProps } from '../types';
import { useQuery } from '@tanstack/react-query';
import { STALE } from '@/lib/queryCache';
import { tenantPlanApi, PublicPricingPlan } from '@/services/tenantPlanApi';
import { billingApi } from '@/services/billingApi';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export const PricingRenderer: React.FC<RendererProps> = ({
    effectiveProps,
    combinedClassName,
    inlineStyles,
    createEditableText,
    componentId
}) => {
    const {
        title = 'Simple, transparent pricing',
        subtitle = 'No hidden fees. Cancel anytime.',
        source = 'manual', // 'manual' | 'frontbase_plans'
        plans = [],
        anchor = '',
        hideOnMobile = false,
        hideOnDesktop = false
    } = effectiveProps;

    const [subscribingTo, setSubscribingTo] = React.useState<string | null>(null);

    const handleSubscribe = async (e: React.MouseEvent, plan: PublicPricingPlan) => {
        if (!isFrontbasePlans || !plan.slug) return;
        e.preventDefault();
        
        setSubscribingTo(plan.slug);
        try {
            const { url } = await billingApi.createCheckoutSession(plan.slug);
            window.location.href = url;
        } catch (err: any) {
            if (err.response?.status === 401) {
                sessionStorage.setItem('pending_checkout_plan', plan.slug);
                window.location.href = '/auth/signup';
            } else {
                toast.error(err.response?.data?.detail || 'Checkout failed');
                setSubscribingTo(null);
            }
        }
    };

    // Fetch Frontbase plans if source is frontbase_plans
    const isFrontbasePlans = source === 'frontbase_plans';
    const { data: publicPlansData, isLoading, error } = useQuery({
        queryKey: ['publicPlans'],
        queryFn: () => tenantPlanApi.listPublicPlans(),
        enabled: isFrontbasePlans,
        staleTime: STALE.STANDARD,
    });

    const activePlans = isFrontbasePlans 
        ? (publicPlansData?.plans || []) 
        : (plans || []);

    const sectionClasses = cn(
        'fb-pricing py-12 sm:py-16 lg:py-24 bg-muted/50 relative border border-dashed border-transparent hover:border-primary/20',
        hideOnMobile ? 'hidden md:block' : '',
        hideOnDesktop ? 'md:hidden' : '',
        combinedClassName
    );

    const gridCols = activePlans.length === 2 ? 'lg:grid-cols-2' :
        activePlans.length === 3 ? 'lg:grid-cols-3' :
            'lg:grid-cols-4';

    return (
        <section id={anchor || componentId} className={sectionClasses} style={inlineStyles}>
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                {(title || subtitle) && (
                    <div className="text-center mb-12 sm:mb-16">
                        {title && (
                            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold mb-4 text-foreground">
                                {createEditableText ? createEditableText(title, 'title', '') : title}
                            </h2>
                        )}
                        {subtitle && (
                            <p className="text-lg sm:text-xl text-muted-foreground">
                                {createEditableText ? createEditableText(subtitle, 'subtitle', '') : subtitle}
                            </p>
                        )}
                    </div>
                )}

                {isLoading ? (
                    <div className="flex justify-center items-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                ) : error ? (
                    <div className="text-center text-destructive py-8">
                        Error loading public plans catalog. Please verify backend state.
                    </div>
                ) : activePlans.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                        No plans configured. Add plans or configure manually.
                    </div>
                ) : (
                    <div className={cn("grid grid-cols-1 gap-6 sm:gap-8 sm:grid-cols-2 max-w-6xl mx-auto", gridCols)}>
                        {activePlans.map((plan: PublicPricingPlan, index: number) => {
                            const cardClasses = cn(
                                'flex flex-col p-6 sm:p-8 rounded-xl border bg-card relative transition-all duration-300 hover:shadow-lg',
                                plan.highlighted ? 'border-primary shadow-lg ring-1 ring-primary' : ''
                            );

                            return (
                                <div key={plan.name || index} className={cardClasses}>
                                    {plan.badge && (
                                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-xs font-semibold rounded-full bg-primary text-primary-foreground shadow-sm">
                                            {plan.badge}
                                        </span>
                                    )}
                                    <div className="mb-6">
                                        <h3 className="text-xl font-semibold mb-2 text-foreground">
                                            {createEditableText && !isFrontbasePlans
                                                ? createEditableText(plan.name, `plans.${index}.name`, '')
                                                : plan.name}
                                        </h3>
                                        {plan.description && (
                                            <p className="text-muted-foreground text-sm">
                                                {createEditableText && !isFrontbasePlans
                                                    ? createEditableText(plan.description, `plans.${index}.description`, '')
                                                    : plan.description}
                                            </p>
                                        )}
                                    </div>
                                    <div className="mb-6">
                                        <span className="text-4xl sm:text-5xl font-bold text-foreground">
                                            {createEditableText && !isFrontbasePlans
                                                ? createEditableText(plan.price, `plans.${index}.price`, '')
                                                : plan.price}
                                        </span>
                                        {plan.period && (
                                            <span className="text-muted-foreground ml-1">
                                                {createEditableText && !isFrontbasePlans
                                                    ? createEditableText(plan.period, `plans.${index}.period`, '')
                                                    : plan.period}
                                            </span>
                                        )}
                                    </div>
                                    <ul className="space-y-3 mb-8 flex-1">
                                        {(plan.features || []).map((feature: string, fIndex: number) => (
                                            <li key={fIndex} className="flex items-center gap-2 text-foreground">
                                                <svg className="w-5 h-5 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                                                </svg>
                                                <span>
                                                    {createEditableText && !isFrontbasePlans
                                                        ? createEditableText(feature, `plans.${index}.features.${fIndex}`, '')
                                                        : feature}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                    <a
                                        href={plan.ctaLink || '#'}
                                        onClick={(e) => isFrontbasePlans ? handleSubscribe(e, plan) : e.preventDefault()}
                                        className={cn(
                                            "inline-flex items-center justify-center w-full px-6 py-3 rounded-lg font-medium transition-colors",
                                            isFrontbasePlans ? 'cursor-pointer' : 'cursor-default',
                                            plan.highlighted
                                                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                                                : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
                                        )}
                                    >
                                        {subscribingTo === plan.slug && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                        {createEditableText && !isFrontbasePlans
                                            ? createEditableText(plan.ctaText || 'Get Started', `plans.${index}.ctaText`, '')
                                            : (plan.ctaText || 'Get Started')}
                                    </a>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
};
