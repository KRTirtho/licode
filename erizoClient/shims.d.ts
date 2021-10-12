/**
 * Typescript type definitions created by 
 * KR Tirtho <krtirtho@gmail.com> © 2021
 */


declare module "javascript-state-machine" {
  export interface LifecycleArgs {
    transition: string,
    from: string,
    to: string
  }

  export interface StateMachineConfig<Methods extends Object = Record<string | number, (lifecycle: LifecycleArgs) => void>, Data = Record<any, unknown>> {
    init?: string;
    transitions: TransitionsConfig[],
    data: (baseStackCalls: unknown) => Data | Data
    methods?: Methods & Partial<Data>
  }

  export interface Lifecycle {
    transition: string,
    from: string
    to: string,
  }

  export interface TransitionsConfig {
    name: string,
    from: string | string[],
    to: string | Function,
    state?: TransitionsConfig
  }


  export class StateMachine<Methods extends Object = Record<string | number, Function>, Data = Record<any, unknown>> {
    state: TransitionsConfig & Data;
    observe(events: Methods): void;
    _fsm: () => {};
    [key: string]: any;
    can(t: string): boolean;
    cannot(t: string): boolean;
    is(s: string): boolean;
    allStates(): string[];
  }

  export function apply<T extends StateMachine>(instance: T, opts?: StateMachineConfig): T;
  export function factory<M, D>(opts?: StateMachineConfig<M, D>): { new(): StateMachine<M, D> };
}