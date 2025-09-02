<script lang="ts">
    import type {KeyID} from "../../types/devices";
    import type {KeyPress, KeyRelease} from "../../engine/CanvasAPI"
    import type { ColorType, Color } from "../../types/color"

    export let deviceID: number;
    export let id: KeyID;
    let active:boolean = false;
    export let keyPress: KeyPress = undefined;
    export let keyRelease: KeyRelease = undefined;
    var button: HTMLButtonElement;
    export function set_color(color: Color)
    {
      // console.log(styles);  
      button.style.backgroundColor = color.rgb_str();
    }

    // Touch event handler functions
    function handleTouchStart(event: TouchEvent) {
        event.preventDefault(); // Prevent default behavior
        active = true;
        if (keyPress) {
            keyPress(deviceID, id);
        }
    }

    function handleTouchEnd(event: TouchEvent) {
        event.preventDefault(); // Prevent default behavior
        active = false;
        if (keyRelease) {
            keyRelease(deviceID, id);
        }
    }

    function handleTouchCancel(event: TouchEvent) {
        event.preventDefault(); // Prevent default behavior
        if(active) {
            active = false;
            if (keyRelease) {
                keyRelease(deviceID, id);
            }
        }
    }
</script>

<button class={$$props.class} style={$$props.style} bind:this={button}
  on:mousedown={() => {
    // console.log(`${id} clicked`)
    active = true;
    if (keyPress) {
        keyPress(deviceID, id);
    }
  }}
  on:mouseup={() => {
    // console.log(`${id} released`)
    active = false;
    if (keyRelease) {
        keyRelease(deviceID, id);
    }
  }}
  on:mouseleave={() => {
    if(active)
    {
      // console.log(`${id} released`)
      active = false;
      keyRelease(deviceID, id);
    }
  }}
  on:touchstart={handleTouchStart}
  on:touchend={handleTouchEnd}
  on:touchcancel={handleTouchCancel}>
</button>

<style>
</style>