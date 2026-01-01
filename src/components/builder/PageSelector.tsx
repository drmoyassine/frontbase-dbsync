import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileText, Home } from 'lucide-react';
import { useBuilderStore } from '@/stores/builder';

export const PageSelector: React.FC = () => {
  const { pages, currentPageId, setCurrentPage } = useBuilderStore();

  const currentPage = pages.find(page => page.id === currentPageId);

  return (
    <Select value={currentPageId || ''} onValueChange={setCurrentPage}>
      <SelectTrigger className="w-48">
        <SelectValue placeholder="Select a page">
          {currentPage && (
            <div className="flex items-center gap-2">
              {currentPage.isHomepage ? (
                <Home className="h-4 w-4" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              {currentPage.name}
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {pages.map((page) => (
          <SelectItem key={page.id} value={page.id}>
            <div className="flex items-center gap-2">
              {page.isHomepage ? (
                <Home className="h-4 w-4" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              {page.name}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};