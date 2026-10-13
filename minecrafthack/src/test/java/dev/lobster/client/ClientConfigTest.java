package dev.lobster.client;

import static org.junit.jupiter.api.Assertions.*;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ClientConfigTest {
    @TempDir Path directory;

    @Test
    void firstLaunchEnablesOnlyHud() throws IOException {
        ClientConfig config = new ClientConfig();
        config.load(directory.resolve("missing.properties"));
        for (Module module : Module.values()) {
            assertEquals(module == Module.HUD, config.enabled(module));
        }
    }

    @Test
    void savesTogglesButDoesNotResumeDetachedCamera() throws IOException {
        Path file = directory.resolve("config/settings.properties");
        ClientConfig original = new ClientConfig();
        original.toggle(Module.ESP);
        original.toggle(Module.FREECAM);
        original.save(file);
        ClientConfig restored = new ClientConfig();
        restored.load(file);
        assertTrue(restored.enabled(Module.ESP));
        assertTrue(restored.enabled(Module.HUD));
        assertFalse(restored.enabled(Module.FREECAM));
        assertFalse(restored.enabled(Module.KILL_AURA));
    }

    @Test
    void ignoresUnknownAndInvalidProperties() throws IOException {
        Path file = directory.resolve("settings.properties");
        Files.writeString(file, "ESP=true\nFREECAM=true\nFLIGHT=broken\nUNKNOWN=true\n");
        ClientConfig config = new ClientConfig();
        config.load(file);
        assertTrue(config.enabled(Module.ESP));
        assertFalse(config.enabled(Module.FREECAM));
        assertFalse(config.enabled(Module.FLIGHT));
    }

    @Test
    void panicPersistsAllModulesOff() throws IOException {
        Path file = directory.resolve("settings.properties");
        ClientConfig config = new ClientConfig();
        config.toggle(Module.KILL_AURA);
        config.toggle(Module.FLIGHT);
        config.disableAll();
        config.save(file);
        ClientConfig restored = new ClientConfig();
        restored.load(file);
        for (Module module : Module.values()) {
            assertFalse(restored.enabled(module));
        }
    }
}
