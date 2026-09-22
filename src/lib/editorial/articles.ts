export type EditorialCategory = "destination" | "hotel" | "tips";
export type EditorialArticle = {slug:string;title:string;category:EditorialCategory;place:string;image:string;imageAlt:string;intro:string;sections:{heading:string;body:string}[]};
export const editorialCategories = [{id:"destination",label:"Destination Guides",description:"Places, neighbourhoods and practical advice"},{id:"hotel",label:"Hotel Decision Guides",description:"What to know before you book"},{id:"tips",label:"Travel Tips & Insights",description:"Smarter, easier travel planning"}] as const;
export const editorialArticles:EditorialArticle[] = [
  {
    "slug": "dubai-beyond-the-landmarks",
    "title": "Dubai Beyond the Landmarks: Where Should You Actually Stay?",
    "category": "destination",
    "place": "Dubai · UAE",
    "image": "/images/atmosphere/rambo/local-pulse.png",
    "imageAlt": "Illustrative urban travel atmosphere",
    "intro": "Dubai is not a single neighbourhood. Choosing a base around the way you want to spend your days can matter more than choosing a familiar hotel name.",
    "sections": [
      {
        "heading": "Start with your daily journeys",
        "body": "Downtown works for travellers prioritising central attractions and the Dubai Mall area. Dubai Marina and JBR suit those who want a walkable waterfront and beach access. Palm Jumeirah often appeals to resort-focused trips, although travel to other parts of the city needs planning. Dubai Creek and Al Seef offer a different perspective through older commercial districts and waterfront heritage areas."
      },
      {
        "heading": "Think about transport before the view",
        "body": "A sea view is not the same as direct beach access. A hotel advertised as close to the Metro may still involve a substantial walk in hot weather. Compare the actual entrance-to-station journey, not just the neighbourhood name, and check whether your itinerary will repeatedly cross the city."
      },
      {
        "heading": "Make the hotel decision",
        "body": "List your two most important daily activities, then compare hotels in the areas that reduce travel friction. Confirm beach access, room configuration, breakfast, cancellation terms and all applicable taxes before committing."
      }
    ]
  },
  {
    "slug": "indian-himalayas-choosing-your-base",
    "title": "The Indian Himalayas: Manali, Shimla or Rishikesh?",
    "category": "destination",
    "place": "India · Mountains",
    "image": "/images/atmosphere/rambo/hero.png",
    "imageAlt": "Illustrative mountain landscape",
    "intro": "A Himalayan holiday can mean alpine scenery, a hill-town break or time beside a river. Manali, Shimla and Rishikesh serve different travel intentions.",
    "sections": [
      {
        "heading": "Choose the experience first",
        "body": "Manali is a base for mountain landscapes and excursions into higher-altitude terrain. Shimla offers a hill-town experience with heritage streets and nearby viewpoints. Rishikesh, on the Ganges in the Himalayan foothills, is associated with riverside stays, yoga and outdoor activities rather than snow-mountain accommodation."
      },
      {
        "heading": "Account for the journey",
        "body": "Travel time can be a major part of a short mountain break. Check the final road transfer from the airport or railway station, seasonal road conditions and how much driving each day trip requires. In monsoon periods, follow official weather and local travel advisories."
      },
      {
        "heading": "Match the accommodation",
        "body": "For a restful trip, compare actual property access, views from the booked room, heating or cooling needs and cancellation flexibility. A beautiful hillside property can be inconvenient for travellers who need easy access to the town centre."
      }
    ]
  },
  {
    "slug": "singapore-three-days-where-to-stay",
    "title": "Singapore in Three Days: Where to Stay to Spend Less Time Travelling",
    "category": "tips",
    "place": "Singapore · Tropical city",
    "image": "/images/atmosphere/rambo/getting-around.png",
    "imageAlt": "Illustrative city travel atmosphere",
    "intro": "With only three days in Singapore, the best hotel location is the one that fits your itinerary rather than the one with the most recognisable skyline.",
    "sections": [
      {
        "heading": "Marina Bay, Orchard or Bugis?",
        "body": "Marina Bay puts major waterfront sights nearby. Orchard is useful for shopping-focused itineraries and has extensive transport connections. Bugis can work well for travellers who want a central base with access to multiple neighbourhoods and food areas."
      },
      {
        "heading": "Use a route-based itinerary",
        "body": "Group sights by area rather than crossing the island repeatedly. Compare walking distances to MRT stations, transfers and the actual time from your hotel to the first stop each morning. Singapore's humidity and rain can change how comfortable a long outdoor walk feels."
      },
      {
        "heading": "Compare the whole stay",
        "body": "For a three-day visit, a slightly higher room rate may be worth considering if it materially reduces travel time. Check room size, breakfast value, cancellation conditions and the full payable amount before deciding."
      }
    ]
  },
  {
    "slug": "amalfi-coast-sea-views-or-easy-transport",
    "title": "Amalfi Coast: Sea Views, Beach Access or Easy Transport?",
    "category": "hotel",
    "place": "Italy · Mediterranean coast",
    "image": "/images/atmosphere/rambo/cost-reality.png",
    "imageAlt": "Illustrative coastal travel atmosphere",
    "intro": "The Amalfi Coast rewards careful location choices. A dramatic view, an accessible beach and easy onward transport do not always come together.",
    "sections": [
      {
        "heading": "Positano, Amalfi or Sorrento?",
        "body": "Positano is known for its steep hillside setting and coastal views; confirm the number of steps between a hotel and the road or beach. Amalfi can suit travellers wanting a coastal town base with ferry and bus connections when operating. Sorrento, outside the Amalfi Coast proper, is often used as a practical transport base for exploring the wider area."
      },
      {
        "heading": "Check accessibility and seasonality",
        "body": "A property may be geographically close to the waterfront yet require steep stairs. Ferries, road traffic and seasonal operating schedules can affect day-trip plans. Verify current routes with operators rather than assuming summer schedules apply year-round."
      },
      {
        "heading": "Choose by trade-off",
        "body": "Decide whether the priority is a view from the room, minimal stairs, beach time or the freedom to make several day trips. Then compare properties on those criteria, including parking and luggage access where relevant."
      }
    ]
  },
  {
    "slug": "bali-ubud-or-uluwatu",
    "title": "Bali: Ubud's Tropical Greenery or Uluwatu's Ocean Views?",
    "category": "destination",
    "place": "Indonesia · Tropical greenery & coast",
    "image": "/images/atmosphere/rambo/smart-choices.png",
    "imageAlt": "Illustrative tropical travel atmosphere",
    "intro": "Ubud and Uluwatu offer distinct versions of Bali. The right base depends on whether you imagine forested landscapes and cultural excursions or a coastal escape.",
    "sections": [
      {
        "heading": "Ubud: inland and green",
        "body": "Ubud is associated with rice terraces, cultural sites, cafés and access to inland excursions. Check whether your accommodation is within walking distance of the centre or requires regular transport. A remote jungle villa can be peaceful but less convenient for spontaneous evenings out."
      },
      {
        "heading": "Uluwatu: coastal and spread out",
        "body": "Uluwatu is known for clifftop scenery and access to beaches, although individual beaches can involve stairs and conditions vary. Restaurants and accommodation are dispersed, so transport arrangements matter."
      },
      {
        "heading": "Consider splitting the stay",
        "body": "For a longer trip, separate inland and coastal stays may reduce repeated cross-island journeys. For a short break, choose the environment you most want to wake up in and plan a smaller number of excursions."
      }
    ]
  },
  {
    "slug": "swiss-alps-choosing-your-base",
    "title": "Swiss Alps: Lauterbrunnen, Grindelwald or Interlaken?",
    "category": "hotel",
    "place": "Switzerland · Alps",
    "image": "/images/atmosphere/rambo/hero.png",
    "imageAlt": "Illustrative alpine landscape",
    "intro": "In the Bernese Oberland, the accommodation decision is also a transport decision. The three bases provide different access to mountain scenery and onward journeys.",
    "sections": [
      {
        "heading": "Lauterbrunnen: the valley",
        "body": "Lauterbrunnen suits travellers who want to stay in the valley and explore surrounding villages and mountain routes. Check the connection from your particular accommodation to the railway station, especially with luggage."
      },
      {
        "heading": "Grindelwald: a mountain-village base",
        "body": "Grindelwald is a convenient starting point for several mountain excursions. Properties vary widely in distance from transport links, so a room with a mountain view may still require a local bus or steep walk."
      },
      {
        "heading": "Interlaken: a wider transport hub",
        "body": "Interlaken can be practical for travellers planning trips in several directions rather than focusing on one valley. Compare total rail time and ticket costs for your planned excursions, and verify operating schedules and mountain weather before booking."
      }
    ]
  }
];
export function getEditorialArticle(slug:string){return editorialArticles.find(a=>a.slug===slug);}
