/**
 * LandingPage - Frontbase SaaS Marketing Page
 * 
 * Public homepage showcasing Frontbase features.
 */

import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
    Layers,
    Database,
    Globe,
    Zap,
    Lock,
    Code2,
    Puzzle,
    Rocket,
    ChevronRight
} from 'lucide-react';

const features = [
    {
        icon: Layers,
        title: 'Visual Builder',
        description: 'Drag-and-drop interface for building pages. No code required.',
    },
    {
        icon: Database,
        title: 'Data Binding',
        description: 'Connect to any database with live sync. Supabase, PostgreSQL, MySQL.',
    },
    {
        icon: Globe,
        title: 'Edge Deployment',
        description: 'Deploy globally with edge computing. Fast load times everywhere.',
    },
    {
        icon: Lock,
        title: 'Row-Level Security',
        description: 'Built-in RLS policies. Your data stays secure by default.',
    },
    {
        icon: Zap,
        title: 'Workflow Actions',
        description: 'Automate tasks with visual workflows. Triggers, conditions, actions.',
    },
    {
        icon: Puzzle,
        title: 'Component Library',
        description: 'Pre-built UI components. Tables, forms, charts, and more.',
    },
];

const stats = [
    { value: '10x', label: 'Faster Development' },
    { value: '0', label: 'Lines of Code' },
    { value: '99.9%', label: 'Uptime SLA' },
    { value: '∞', label: 'Possibilities' },
];

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-slate-900">
            {/* Navigation */}
            <nav className="fixed top-0 w-full z-50 bg-slate-900/80 backdrop-blur-lg border-b border-slate-800">
                <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
                    <Link to="/" className="flex items-center gap-3">
                        <img src="/icon.png" alt="Frontbase" className="h-8 w-8" />
                        <span className="text-xl font-bold text-white">Frontbase</span>
                    </Link>
                    <div className="hidden md:flex items-center gap-8">
                        <a href="#features" className="text-slate-400 hover:text-white transition-colors">Features</a>
                        <a href="#how-it-works" className="text-slate-400 hover:text-white transition-colors">How It Works</a>
                        <a href="#pricing" className="text-slate-400 hover:text-white transition-colors">Pricing</a>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link to="/login">
                            <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-800">
                                Sign In
                            </Button>
                        </Link>
                        <Link to="/login">
                            <Button className="bg-emerald-500 hover:bg-emerald-600 text-white">
                                Get Started
                                <ChevronRight className="ml-1 h-4 w-4" />
                            </Button>
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="pt-32 pb-24 px-6">
                <div className="max-w-4xl mx-auto text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm mb-8">
                        <Rocket className="h-4 w-4" />
                        Now in Public Beta
                    </div>
                    <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
                        Build Apps{' '}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
                            Visually
                        </span>
                    </h1>
                    <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10">
                        The no-code platform for designers and developers.
                        Create powerful web applications without writing a single line of code.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Link to="/login">
                            <Button size="lg" className="bg-emerald-500 hover:bg-emerald-600 text-white text-lg px-8 h-14">
                                Start Building Free
                                <ChevronRight className="ml-2 h-5 w-5" />
                            </Button>
                        </Link>
                        <Button
                            size="lg"
                            variant="outline"
                            className="border-slate-500 text-slate-200 bg-slate-800/50 hover:bg-slate-700 hover:text-white hover:border-slate-400 text-lg px-8 h-14"
                        >
                            <Code2 className="mr-2 h-5 w-5" />
                            View Demo
                        </Button>
                    </div>
                </div>

                {/* Hero Image/Screenshot Placeholder */}
                <div className="max-w-6xl mx-auto mt-16">
                    <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-800/50 aspect-video flex items-center justify-center">
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent" />
                        <div className="text-slate-500 flex flex-col items-center gap-4">
                            <Layers className="h-16 w-16" />
                            <p className="text-lg">Builder Preview Coming Soon</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Stats Section */}
            <section className="py-16 border-y border-slate-800 bg-slate-900/50">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                        {stats.map((stat, i) => (
                            <div key={i} className="text-center">
                                <div className="text-4xl md:text-5xl font-bold text-emerald-400 mb-2">{stat.value}</div>
                                <div className="text-slate-400">{stat.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section id="features" className="py-24 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                            Everything You Need to Build
                        </h2>
                        <p className="text-slate-400 max-w-2xl mx-auto">
                            Frontbase comes with all the tools you need to create, deploy, and scale your applications.
                        </p>
                    </div>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {features.map((feature, i) => (
                            <div
                                key={i}
                                className="group p-6 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:border-emerald-500/50 hover:bg-slate-800 transition-all duration-300"
                            >
                                <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-4 group-hover:bg-emerald-500/20 transition-colors">
                                    <feature.icon className="h-6 w-6 text-emerald-400" />
                                </div>
                                <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
                                <p className="text-slate-400">{feature.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* How It Works Section */}
            <section id="how-it-works" className="py-24 px-6 bg-slate-800/30">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                            How It Works
                        </h2>
                        <p className="text-slate-400 max-w-2xl mx-auto">
                            From idea to production in minutes, not months.
                        </p>
                    </div>
                    <div className="grid md:grid-cols-3 gap-8">
                        {[
                            { step: '01', title: 'Connect Data', desc: 'Link your database or use our built-in storage. Supabase, PostgreSQL, or MySQL.' },
                            { step: '02', title: 'Build Pages', desc: 'Drag and drop components to create your UI. Bind data with a click.' },
                            { step: '03', title: 'Deploy & Scale', desc: 'One-click deployment to the edge. Global CDN included.' },
                        ].map((item, i) => (
                            <div key={i} className="relative">
                                <div className="text-7xl font-bold text-slate-700/50 mb-4">{item.step}</div>
                                <h3 className="text-xl font-semibold text-white mb-2">{item.title}</h3>
                                <p className="text-slate-400">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-24 px-6">
                <div className="max-w-4xl mx-auto text-center">
                    <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
                        Ready to Build Something Amazing?
                    </h2>
                    <p className="text-xl text-slate-400 mb-10">
                        Join thousands of developers and designers building the future.
                    </p>
                    <Link to="/login">
                        <Button size="lg" className="bg-emerald-500 hover:bg-emerald-600 text-white text-lg px-10 h-14">
                            Get Started for Free
                            <ChevronRight className="ml-2 h-5 w-5" />
                        </Button>
                    </Link>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-12 px-6 border-t border-slate-800">
                <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-3">
                        <img src="/icon.png" alt="Frontbase" className="h-6 w-6" />
                        <span className="text-slate-400">© 2024 Frontbase. All rights reserved.</span>
                    </div>
                    <div className="flex items-center gap-6 text-slate-400">
                        <a href="#" className="hover:text-white transition-colors">Privacy</a>
                        <a href="#" className="hover:text-white transition-colors">Terms</a>
                        <a href="#" className="hover:text-white transition-colors">Documentation</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
