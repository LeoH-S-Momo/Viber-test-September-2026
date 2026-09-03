import { Module } from '@nestjs/common';

// persistence
import { ArtistsRepository } from './persistence/artists.repository';
import { CabinCategoriesRepository } from './persistence/cabin-categories.repository';
import { CabinsRepository } from './persistence/cabins.repository';
import { CruisesRepository } from './persistence/cruises.repository';
import { DecksRepository } from './persistence/decks.repository';
import { EventsRepository } from './persistence/events.repository';
import { ExperiencesRepository } from './persistence/experiences.repository';
import { ItineraryStopsRepository } from './persistence/itinerary-stops.repository';
import { PortsRepository } from './persistence/ports.repository';
import { RestaurantsRepository } from './persistence/restaurants.repository';
import { ShipsRepository } from './persistence/ships.repository';
import { VenuesRepository } from './persistence/venues.repository';

// application
import { ArtistsService } from './application/artists.service';
import { CabinCategoriesService } from './application/cabin-categories.service';
import { CabinsService } from './application/cabins.service';
import { CruisesService } from './application/cruises.service';
import { DecksService } from './application/decks.service';
import { EventsService } from './application/events.service';
import { ExperiencesService } from './application/experiences.service';
import { ItineraryStopsService } from './application/itinerary-stops.service';
import { PortsService } from './application/ports.service';
import { RestaurantsService } from './application/restaurants.service';
import { ShipsService } from './application/ships.service';
import { VenuesService } from './application/venues.service';

// presentation
import { ArtistsController } from './presentation/artists.controller';
import { CabinCategoriesController } from './presentation/cabin-categories.controller';
import { CabinsController } from './presentation/cabins.controller';
import { CruisesController } from './presentation/cruises.controller';
import { DecksController } from './presentation/decks.controller';
import { EventsController } from './presentation/events.controller';
import { ExperiencesController } from './presentation/experiences.controller';
import { ItineraryStopsController } from './presentation/itinerary-stops.controller';
import { PortsController } from './presentation/ports.controller';
import { RestaurantsController } from './presentation/restaurants.controller';
import { ShipsController } from './presentation/ships.controller';
import { VenuesController } from './presentation/venues.controller';

/**
 * Modulo de catalogo — descoberta e gestao de conteudo (navios, decks,
 * cabines, cruzeiros, itinerario, portos, eventos, artistas, venues,
 * restaurantes, experiencias). Camadas separadas por pasta:
 * presentation (HTTP) -> application (casos de uso + autorizacao por posse)
 * -> persistence (Prisma) — com domain/ (pagination, CruiseStatusPolicy)
 * livre de framework/Prisma. Ver docs/architecture/decisions/0006-catalog-layering.md.
 */
@Module({
  controllers: [
    PortsController,
    ArtistsController,
    ShipsController,
    DecksController,
    CabinCategoriesController,
    CabinsController,
    VenuesController,
    RestaurantsController,
    CruisesController,
    ItineraryStopsController,
    EventsController,
    ExperiencesController,
  ],
  providers: [
    PortsRepository,
    ArtistsRepository,
    ShipsRepository,
    DecksRepository,
    CabinCategoriesRepository,
    CabinsRepository,
    VenuesRepository,
    RestaurantsRepository,
    CruisesRepository,
    ItineraryStopsRepository,
    EventsRepository,
    ExperiencesRepository,
    PortsService,
    ArtistsService,
    ShipsService,
    DecksService,
    CabinCategoriesService,
    CabinsService,
    VenuesService,
    RestaurantsService,
    CruisesService,
    ItineraryStopsService,
    EventsService,
    ExperiencesService,
  ],
  exports: [ShipsService, CruisesService],
})
export class CatalogModule {}
