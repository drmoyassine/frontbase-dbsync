import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PropertiesPanel } from './PropertiesPanel';
import { StylingPanel } from './StylingPanel';
import { Settings, Palette } from 'lucide-react';

export const RightSidebar: React.FC = () => {
  const [activeTab, setActiveTab] = useState('properties');

  return (
    <div className="h-full flex flex-col bg-background">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
        <TabsList className="grid w-full grid-cols-2 m-2 mb-0">
          <TabsTrigger value="properties" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Properties
          </TabsTrigger>
          <TabsTrigger value="styling" className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Styling
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="properties" className="flex-1 m-0">
          <PropertiesPanel />
        </TabsContent>
        
        <TabsContent value="styling" className="flex-1 m-0">
          <StylingPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};