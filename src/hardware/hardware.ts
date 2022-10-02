import type { Input, Output } from "webmidi";
import { KeyType, MidiDevice, type DeviceKeyID, type GridDeviceConfig } from "./types/devices";

import type {KeyID, DeviceInfo} from "../types/devices";
import type {KeyPress, KeyRelease} from "../engine/CanvasAPI"
import { ColorType, Color } from "../types/color"


import { WebMidi } from "webmidi";
import DeviceConfigs from "./devices";
import { dev } from "$app/env";

export class GridController {
    id: number;
    name?: string;
    activeInput?: Input;
    activeOutput?: Output;
    activeConfig?: GridDeviceConfig

    keyPress: KeyPress;
    keyRelease: KeyRelease;

    static callback?: ({}) => unknown

    constructor(id: number, keyPress: KeyPress, keyRelease: KeyRelease)
    {
        this.id = id;
        this.keyPress = keyPress;
        this.keyRelease = keyRelease;
    }

    static async start(callback: typeof GridController.callback): Promise<boolean>
    {
        try
        {
            if(WebMidi.enabled == false)
            {
                await WebMidi.enable({sysex: true})
                WebMidi.addListener("portschanged", (e) => {
                    GridController.updateDeviceList(true, true);
                })
                GridController.updateDeviceList(true, false);
            }
            GridController.callback = callback;
            return true;
        }
        catch(e)
        {
            console.log(e);
            return false;
        }
    }

    static onMidiStateChange(e) {
        console.log(e);
    }

    static deviceList:MidiDevice[] = [];
    static updateDeviceList(strict_mode = true, callback = false)
    {
        let devices:MidiDevice[] = []

        for(const input of WebMidi.inputs)
        {
            for(const output of WebMidi.outputs)
            {
                if(input.name === output.name)
                {   
                    let config: GridDeviceConfig | undefined = undefined;
                    for (const name in DeviceConfigs) 
                    {
                        let config_regex : string = DeviceConfigs[name].midiNameRegex!;
                        if(input.name.match(config_regex) !== null)
                        {
                            console.log(`Output device config found: ${name}`)
                            config = DeviceConfigs[name];
                            break;
                        }
                    }

                    if(strict_mode && config === undefined)
                        break;

                    devices.push(new MidiDevice(input.name, input, output, config));
                    break;
                }
            }
        }

        if(callback)
        {
            var new_devices = devices.map(x => x.name);
            var old_devices = GridController.deviceList.map(x => x.name);
            for(var new_connection of new_devices.filter(x => !old_devices.includes(x)))
            {
                this.callback({event:"connected", device:new_connection});
            }
            for(var removed_connection of old_devices.filter(x => !new_devices.includes(x)))
            {
                this.callback({event:"disconnected", device:removed_connection});
            }
        }

        GridController.deviceList = devices;
        return devices;
    }

    /** Returns the configuration of all the devices. */
    static configList(): {[name:string]: GridDeviceConfig}
    {
        return DeviceConfigs;
    }

    static addConfig(config : GridDeviceConfig)
    {
        DeviceConfigs[config.name] = config;
    }

    static availableDevices() : MidiDevice[]
    {
        return GridController.updateDeviceList(true, false);
    }

    /** Returns all the available MIDI inputs. */
    static availableDeviceInputs() : Input[]
    {
        console.log(WebMidi.inputs);
        return WebMidi.inputs;
    }

    /** Returns all the available MIDI ouputs. */
    static availableDeviceOutputs() : Output[]
    {
        console.log(WebMidi.outputs);
        return WebMidi.outputs;
    }

    deviceDisconnectedHandler(e: any)
    {
        if(e.port === this.activeInput || e.port === this.activeOutput)
        {
            this.disconnect();
        }
    }

    deviceEventHandler(e : any) // TODO Fix
    {
        // console.log(e)
        switch(e.type)
        {
            case "midimessage":
            {
                switch(e.message.type)
                {
                    case "noteon":
                    case "noteoff":
                    case "controlchange":
                    {
                        // console.log(`${e.message.type} - ${e.message.data}`)
                        if(this.activeConfig)
                        {
                            let xy:[number, number] = this.activeConfig.noteToXY(e.message.data[1])
                            if(isNaN(xy[0])||isNaN(xy[1]))
                                return;
                            if(e.message.data[2])
                            {
                                this.keyPress(this.id, xy);
                            }
                            else
                            {
                                this.keyRelease(this.id, xy);
                            }
                        }
                        break;
                    }
            }
                break;
            }
            case "closed":
            case "disconnected":
            {
                console.log("Device connection closed")
                this.disconnect();
                break;
            }
            default:
            {
                console.log(e.type);
            }
        }
    }

    connectDevice(device: MidiDevice)
    {
        this.disconnect();
        if(!device) return;
        console.log(device);
        this.connect(device.input, device.output, device.config);
    }

    connect(input_device:Input|string|undefined, output_device:Output|string|undefined, config?:GridDeviceConfig|string) 
    {
        this.disconnect();

        if(typeof input_device === 'string' || input_device instanceof String)
        {
            for(var input of GridController.availableDeviceInputs())
            {
                if(input.name == input_device)
                {
                    this.activeInput = input;
                    break;
                }
            }
        }
        else
        {
            this.activeInput = input_device;
        }

        if(typeof output_device === 'string' || output_device instanceof String)
        {
            for(var output of GridController.availableDeviceOutputs())
            {
                if(output.name == output_device)
                {
                    this.activeOutput = output;
                    break;
                }
            }
        }
        else
        {
            this.activeOutput = output_device;
        }

        if(input_device === undefined && output_device === undefined)
        {
            console.log("Both Input and output are undefined");
            return;
        }

        this.name = input_device ? input_device?.name : output_device?.name;
        this.activeInput?.addListener("midimessage", e => this.deviceEventHandler(e));
        // this.activeInput?.addListener("disconnected", e => {console.log("Disconnect from input")});
        // this.activeOutput?.addListener("disconnected", e => {console.log("Disconnect from output")});
        WebMidi.addListener("disconnected", e => this.deviceDisconnectedHandler(e)); //work around

        
        if(config === undefined) //We need to try to auto match device config
        {
            //Input
            let input_config : GridDeviceConfig|undefined = undefined;
            if(this.activeInput)
            {
                console.log(`Attempting find input config for ${this.activeInput.name}`);
                let input_name : string = this.activeInput?.name;
                for (const name in DeviceConfigs) 
                {
                    let config_regex : string = DeviceConfigs[name].midiNameRegex!;
                    if(input_name.match(config_regex) !== null)
                    {
                        console.log(`Input device config found: ${name}`)
                        input_config = DeviceConfigs[name];
                        break;
                    }
                }
            }

            //Output
            let output_config : GridDeviceConfig|undefined = undefined;
            if(this.activeOutput)
            {
                console.log(`Attempting find output config for ${this.activeOutput.name}`);
                let output_name : string = this.activeOutput?.name;
                for (const name in DeviceConfigs) 
                {
                    let config_regex : string = DeviceConfigs[name].midiNameRegex!;
                    if(output_name.match(config_regex) !== null)
                    {
                        console.log(`Output device config found: ${name}`)
                        output_config = DeviceConfigs[name];
                        break;
                    }
                }
            }

            if(output_config === input_config)
            {
                this.activeConfig = output_config;
            }
            else //Not matched
            {
                if(input_device === undefined && output_config)
                {
                    this.activeConfig = output_config;
                }
                else if(output_device === undefined && input_config)
                {
                    this.activeConfig = input_config;
                }
                else
                {
                    this.activeConfig = undefined;
                    console.log("Unable to auto match device config")
                }
            }
        }
        else if(typeof config === "string")
        {  
            console.log(`DeviceConfig ${config} used`)
            this.activeConfig = DeviceConfigs[<string>config]; 
        }
        else // if (typeof config === "DeviceConfig") - Does not work, let's assume it is DeviceConfig
        {
            console.log("DeviceConfig from parameter used")
            this.activeConfig = <GridDeviceConfig>config;
        }

        if(this.activeConfig === undefined)
        {
            console.log("No active config");
        }
        else
        {
            console.log(`${this.activeConfig.name} config used`);
            if(this.activeOutput && this.activeConfig.initializationSysex)
            {
                for(let message of this.activeConfig.initializationSysex)
                {
                    this.activeOutput!.sendSysex([], message);
                }
            }
        }

        GridController.callback({deviceID: this.id, event: "opened"});
    }

    disconnect() 
    {
        if(this.activeInput || this.activeOutput)
        {
            this.activeInput?.removeListener();
            this.activeOutput?.removeListener();

            this.activeInput = undefined;
            this.activeOutput = undefined;
            this.activeConfig = undefined;
            this.name = undefined;
            
            GridController.callback({deviceID: this.id, event: "closed"});
        }
    }

    getDeviceInfo(): DeviceInfo | undefined
    {
        if(this.activeConfig === undefined)
            return undefined;
        
        return {
            dimension: this.activeConfig.dimension,
            grid_dimension: this.activeConfig.gridDimension,
            grid_offset: this.activeConfig.gridOffset,
            chain_key: this.activeConfig.chainKey,
        }
    }

    setConfig(config:GridDeviceConfig) {}

    outputReady()
    {
        return this.activeOutput != undefined && this.activeConfig != undefined;  
    }

    setColor(keyID: KeyID, color: Color) {
        if(this.activeConfig === undefined)
            return;
        if(Array.isArray(keyID))
        {
            keyID = [
                keyID[0] + this.activeConfig.gridOffset[0],
                keyID[1] + this.activeConfig.gridOffset[1]
            ];
        }
        let deviceKeyID = this.activeConfig.keymap?.[keyID[1]]?.[keyID[0]];
        // console.log(`${keyID[0]} ${keyID[1]} ${note}`)
        if(deviceKeyID) {
            this.setColorOnDevice(deviceKeyID, color);    
        }
    }

    setColorOnDevice(keyID: DeviceKeyID, color: Color)
    {
        if(this.activeConfig === undefined)
            return;
        if(color.type === ColorType.Palette)
        {
            let channel = this.activeConfig.paletteChannel[color.palette()];
            let value = color.index();
            if(channel)
            {
                if(!Array.isArray(keyID))
                {
                    this.activeOutput!.send([0x90 + channel - 1, keyID, value!]);
                }
                else if(!Array.isArray(keyID) || keyID[0] == KeyType.Note)
                {
                    this.activeOutput!.send([0x90 + channel - 1, keyID[1], value!]);
                }
                else if(keyID[0] == KeyType.CC)
                {
                    this.activeOutput!.send([0xb0 + channel - 1, keyID[1], value!]);
                }
                else if(keyID[0] == KeyType.Sysex && this.activeConfig.rgbSysexGen)
                {
                    this.setColorOnDevice(keyID[1], new Color(ColorType.RGB, color.rgb()));
                }

            }
            else if(this.activeConfig.rgbSysexGen)
            {
                this.setColorOnDevice(keyID, new Color(ColorType.RGB, color.rgb()));
            }
        }
        else if(color.type === ColorType.RGB && this.activeConfig.rgbSysexGen)
        {
            if(Array.isArray(keyID))
            {
                keyID = keyID[1]; //Assume All messages can be triggered via sysex. Like if a message was flaired with CC, but Sysex will override it
            }
            let message = (this.activeConfig.rgbSysexGen(keyID, color.rgb()));
            this.activeOutput!.sendSysex([], message);
        } 
    }

    clear(){}

    fill(color: number){}

    fillPalette(index: number, channel?: number){}


}