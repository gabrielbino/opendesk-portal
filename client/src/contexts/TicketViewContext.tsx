import React, { createContext, useContext, useState } from 'react';

export interface ViewingUser {
  userId: number;
  userName: string;
}

interface TicketViewContextType {
  viewingTickets: Record<number, ViewingUser>; // ticketId -> ViewingUser
  setTicketViewing: (ticketId: number, user: ViewingUser | null) => void;
}

const TicketViewContext = createContext<TicketViewContextType | undefined>(undefined);

export function TicketViewProvider({ children }: { children: React.ReactNode }) {
  const [viewingTickets, setViewingTickets] = useState<Record<number, ViewingUser>>({});

  const setTicketViewing = (ticketId: number, user: ViewingUser | null) => {
    setViewingTickets((prev) => {
      const updated = { ...prev };
      if (user) {
        updated[ticketId] = user;
      } else {
        delete updated[ticketId];
      }
      return updated;
    });
  };

  return (
    <TicketViewContext.Provider value={{ viewingTickets, setTicketViewing }}>
      {children}
    </TicketViewContext.Provider>
  );
}

export function useTicketView() {
  const context = useContext(TicketViewContext);
  if (!context) {
    throw new Error('useTicketView must be used within TicketViewProvider');
  }
  return context;
}
