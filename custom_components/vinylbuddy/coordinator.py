"""Coordinator for Vinyl Buddy."""

from __future__ import annotations

from datetime import timedelta
import logging

from aiohttp import ClientError

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import CONF_BASE_URL, DEFAULT_SCAN_INTERVAL_SECONDS, DOMAIN

LOGGER = logging.getLogger(__name__)


class VinylBuddyCoordinator(DataUpdateCoordinator[dict]):
    """Coordinate Vinyl Buddy data updates."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.base_url = entry.data[CONF_BASE_URL].rstrip("/")
        super().__init__(
            hass,
            LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=DEFAULT_SCAN_INTERVAL_SECONDS),
        )

    async def _async_update_data(self) -> dict:
        """Fetch current now-playing data from Vinyl Buddy."""
        try:
            session = async_get_clientsession(self.hass)
            async with session.get(
                f"{self.base_url}/api/now_playing",
                timeout=10,
            ) as response:
                response.raise_for_status()
                data = await response.json()
                if not isinstance(data, dict):
                    raise UpdateFailed("Vinyl Buddy returned an unexpected response.")
                return data
        except (ClientError, TimeoutError, ValueError) as err:
            raise UpdateFailed(f"Error communicating with Vinyl Buddy: {err}") from err
