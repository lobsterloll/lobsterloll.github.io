package dev.lobster.client;

import net.minecraft.client.KeyMapping;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.network.chat.Component;

public final class ToggleScreen extends Screen {
    public ToggleScreen() {
        super(Component.literal("Lobster Client"));
    }

    @Override
    protected void init() {
        int buttonWidth = Math.min(225, (width - 36) / 2);
        int left = width / 2 - buttonWidth - 6;
        int top = Math.max(38, height / 2 - 82);
        Module[] modules = Module.values();
        for (int i = 0; i < modules.length; i++) {
            Module module = modules[i];
            Button button = Button.builder(label(module), clicked -> {
                LobsterClient.toggle(module);
                clicked.setMessage(label(module));
            }).bounds(left + (i % 2) * (buttonWidth + 12), top + (i / 2) * 23, buttonWidth, 20).build();
            button.setTooltip(Tooltip.create(Component.literal(module.category + " - " + module.description)));
            addRenderableWidget(button);
        }
        addRenderableWidget(Button.builder(Component.literal("Disable all"), clicked -> {
            LobsterClient.disableAll();
            rebuildWidgets();
        }).bounds(left + buttonWidth + 12, top + 6 * 23, buttonWidth, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Done"), clicked -> onClose())
            .bounds(width / 2 - 50, top + 170, 100, 20).build());
    }

    private Component label(Module module) {
        return Component.literal((LobsterClient.enabled(module) ? "[ON]  " : "[OFF]  ") + module.label)
            .withColor(LobsterClient.enabled(module) ? 0xA6E7CF : 0xD2DEE8);
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        graphics.fill(0, 0, width, height, 0xE8111720);
        graphics.centeredText(font, "LOBSTER CLIENT", width / 2, 12, 0xFFFF8A70);
        graphics.centeredText(font, "26.3  /  Hover for details  /  F6: Freecam  /  End: All off", width / 2, 26, 0xFFB6C7D5);
        super.extractRenderState(graphics, mouseX, mouseY, partialTick);
    }

    @Override
    public boolean keyPressed(KeyEvent event) {
        if (KeyMapping.get("key.lobster_client.menu").matches(event)) {
            onClose();
            return true;
        }
        if (KeyMapping.get("key.lobster_client.panic").matches(event)) {
            LobsterClient.disableAll();
            rebuildWidgets();
            return true;
        }
        return super.keyPressed(event);
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }
}
