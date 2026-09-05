-- BookingExperience only had @@unique([bookingId, experienceId]) — experienceId is not the
-- leading column of that composite index, so a query filtering by experienceId alone (used by
-- sumActiveExperiencePartySize(Plain), a hot path hit on every experience-availability read and
-- every updateDetails call) could not use it. EventReservation/DiningReservation already have an
-- explicit index for the equivalent pattern; this brings BookingExperience in line.
CREATE INDEX "booking_experiences_experienceId_idx" ON "booking_experiences"("experienceId");
