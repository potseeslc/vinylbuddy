"""Config flow for Vinyl Buddy."""

from __future__ import annotations

from aiohttp import ClientError
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import CONF_BASE_URL, DEFAULT_NAME, DOMAIN


class VinylBuddyConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Vinyl Buddy."""

    VERSION = 1

    async def async_step_user(self, user_input: dict | None = None):
        """Handle the initial step."""
        errors: dict[str, str] = {}

        if user_input is not None:
            base_url = user_input[CONF_BASE_URL].rstrip("/")
            session = async_get_clientsession(self.hass)

            try:
                async with session.get(f"{base_url}/api/health", timeout=10) as response:
                    response.raise_for_status()
                    data = await response.json()
            except (ClientError, TimeoutError, ValueError):
                errors["base"] = "cannot_connect"
            else:
                if data.get("ok") is True:
                    await self.async_set_unique_id(base_url)
                    self._abort_if_unique_id_configured()
                    return self.async_create_entry(
                        title=DEFAULT_NAME,
                        data={CONF_BASE_URL: base_url},
                    )
                errors["base"] = "cannot_connect"

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_BASE_URL, default="http://vinylbuddy.local:3000"): str,
                }
            ),
            errors=errors,
        )
