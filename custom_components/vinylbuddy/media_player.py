"""Media player entity for Vinyl Buddy."""

from __future__ import annotations

from homeassistant.components.media_player import MediaPlayerEntity
from homeassistant.components.media_player.const import MediaPlayerState
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DEFAULT_NAME, DOMAIN
from .coordinator import VinylBuddyCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Vinyl Buddy media player from a config entry."""
    coordinator: VinylBuddyCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([VinylBuddyMediaPlayer(coordinator, entry.entry_id)])


class VinylBuddyMediaPlayer(CoordinatorEntity[VinylBuddyCoordinator], MediaPlayerEntity):
    """Representation of Vinyl Buddy now playing state."""

    _attr_has_entity_name = True
    _attr_name = DEFAULT_NAME

    def __init__(self, coordinator: VinylBuddyCoordinator, entry_id: str) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry_id}_now_playing"

    @property
    def state(self) -> MediaPlayerState:
        """Return the state of the player."""
        current = self.coordinator.data or {}
        if current.get("state") == "playing":
            return MediaPlayerState.PLAYING
        return MediaPlayerState.IDLE

    @property
    def media_title(self) -> str | None:
        """Return current track title."""
        return (self.coordinator.data or {}).get("title")

    @property
    def media_artist(self) -> str | None:
        """Return current artist."""
        return (self.coordinator.data or {}).get("artist")

    @property
    def media_album_name(self) -> str | None:
        """Return current album name."""
        return (self.coordinator.data or {}).get("album")

    @property
    def media_duration(self) -> int | None:
        """Return track duration in seconds."""
        return (self.coordinator.data or {}).get("duration")

    @property
    def media_image_url(self) -> str | None:
        """Return album art URL."""
        return (self.coordinator.data or {}).get("image_url")

    @property
    def extra_state_attributes(self) -> dict[str, str | None]:
        """Return additional attributes."""
        current = self.coordinator.data or {}
        return {
            "album_year": current.get("album_year"),
            "source": current.get("source"),
            "updated_at": current.get("updated_at"),
        }
