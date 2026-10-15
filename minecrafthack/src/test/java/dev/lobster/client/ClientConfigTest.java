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

    @Test
    void savesAutoEatChoices() throws IOException {
        Path file = directory.resolve("settings.properties");
        ClientConfig original = new ClientConfig();
        original.autoEatPriority = ClientConfig.FoodPriority.COMBINED;
        original.autoEatThreshold = ClientConfig.EatThreshold.BOTH;
        original.autoEatHunger = 12;
        original.autoEatHealth = 7;
        original.autoEatSearchInventory = true;
        original.autoEatPauseAuras = false;
        original.autoEatBlacklist.remove("minecraft:golden_apple");
        original.save(file);

        ClientConfig restored = new ClientConfig();
        restored.load(file);
        assertEquals(original.autoEatPriority, restored.autoEatPriority);
        assertEquals(original.autoEatThreshold, restored.autoEatThreshold);
        assertEquals(12, restored.autoEatHunger);
        assertEquals(7, restored.autoEatHealth);
        assertTrue(restored.autoEatSearchInventory);
        assertFalse(restored.autoEatPauseAuras);
        assertFalse(restored.autoEatBlacklist.contains("minecraft:golden_apple"));
        assertTrue(restored.autoEatBlacklist.contains("minecraft:chorus_fruit"));
    }

    @Test
    void savesAutoExpChoices() throws IOException {
        Path file = directory.resolve("settings.properties");
        ClientConfig original = new ClientConfig();
        original.autoExpMode = ClientConfig.ExpMode.HANDS;
        original.autoExpReplenish = false;
        original.autoExpOnlyGround = true;
        original.autoExpSlot = 3;
        original.autoExpMinThreshold = 25;
        original.autoExpMaxThreshold = 90;
        original.save(file);

        ClientConfig restored = new ClientConfig();
        restored.load(file);
        assertEquals(ClientConfig.ExpMode.HANDS, restored.autoExpMode);
        assertFalse(restored.autoExpReplenish);
        assertTrue(restored.autoExpOnlyGround);
        assertEquals(3, restored.autoExpSlot);
        assertEquals(25, restored.autoExpMinThreshold);
        assertEquals(90, restored.autoExpMaxThreshold);
    }
}
