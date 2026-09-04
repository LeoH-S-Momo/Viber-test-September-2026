export interface MyTicket {
  id: string;
  qrCode: string;
  status: 'ISSUED' | 'CHECKED_IN' | 'CANCELLED';
  issuedAt: string;
  qrCodeDataUrl: string;
  bookingGuest: {
    fullName: string;
    booking: {
      cruise: { title: string; slug: string; embarkationDate: string };
      cabin: { code: string; cabinCategory: { name: string } };
    };
  };
}

/** Espelha CheckInTicketView (backend) — ver ADR-0013. */
export interface CheckInTicketView {
  ticketId: string;
  code: string;
  status: 'ISSUED' | 'CHECKED_IN' | 'CANCELLED';
  passengerName: string;
  accountHolderName: string;
  cruiseTitle: string;
  cruiseSlug: string;
  cabinCode: string;
  cabinCategoryName: string;
  bookingStatus: string;
}

export type CheckInOutcome = 'NOT_CHECKED_IN' | 'CHECKED_IN' | 'INVALID' | 'ALREADY_USED';

export interface CheckInLookupResult {
  outcome: CheckInOutcome;
  ticket: CheckInTicketView | null;
}
