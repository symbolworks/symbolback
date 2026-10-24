# Symbolback

An action-driven backend that exposes only the current context data and available actions to the middleware's processing instructions.

## The idea

This project explores whether a backend can be separated from a middleware, exposing in middleware only the current context and a set of available actions that may operate on that context. The middleware becomes responsible for maintaining runtime states which respond to context sent from the backend, and which generate new actions to control the backend.

From the system side, the backend still serves to input contextually dependent actions and output new context data, but its role is more limited than in classical backends that embrace the entire data exposing logic. In Symbolback, a considerable part of that logic is delegated to the middleware which maintains its runtime states synchronized with the bare backend.

The backend thus becomes a very thin server layer that manages input from and output to the overlaying middleware. The backend eventually responds with a context and a set of actions available in that context. The minimal set of actions include navigating and altering persistent data. The middleware then decides which action is next to take for receiving a new context from the backend.

## Example

One image is worth of thousand words, but with backend we don't deal with images. Instead, we'll try to picture a typical communication example between the middleware and backend. The persistent data contained in the backend resembles a kind of classical S-expressions where each node may be an atom or a list of nodes, making possible to represent trees as list of lists.

### writing the data

The application starts with the empty list stored in the persistence backend layer:

```
()
```

Internally, the backend session holds a pointer that points to the current context. The middleware can query the backend for the current context regarding the pointer position. The middleware can also send pointer actions to the backend, navigating through the structure of data. Lastly, the middleware can send the list altering actions. However, available actions depend on what kind the current context is, and which position within the conainer list it takes. The actions may include `next` and `previous` for any element of a list, `enter` into and `exit` from the current list, `insert` and `delete` for any kind of element, and finally `update` for atoms.

Let's finally start with data writing example. first we send the `insert` action. The backend enters `inserting` context state, expecting the atom data or a `cancel` action. Then we send `"Tasks"` action. The instruction cycle ended, and our new persistent data looks like this:

```
("Tasks")
```

Now we want to insert a list after the `Tasks` element. We sequentially send:

`next` `insert` `list`

the persistent layer looks like this:

```
("Tasks" ())
```

Now we enter the list and insert a new atom:

`enter` `insert` `"Task"`

Then we insert three fields:

`next` `insert` `"2026-09-08"`
`next` `insert` `"10:00"`
`next` `insert` `"Go to dentist"`

The persistent data finally looks like this:

```
("Tasks" ("Task" "2026-09-08" "10:00" "Go to dentist"))
```

Lastly, we send the actions:

`exit` `first`

to return to the root list. 

Now we may end the application session knowing that - under under condition that the data stays intact from the third side - the same data will be waiting for us next time we open a new session.

### reading the data

When we open a new session on the above persistent data, to traverse over elements, we may send a series of actions responding with new states:

State: `(STATE (CTX "TASKS") (ACTIONS next first last insert update delete))`  
Action: `next`  
State: `(STATE (CTX list) (ACTIONS next first last insert delete enter))`  
Action: `enter`  
State: `(STATE (CTX "TASK") (ACTIONS next first last insert update delete))`  
Action: `next`  
State: `(STATE (CTX "2026-09-08") (ACTIONS previous next first last insert update delete))`  
Action: `next`  
State: `(STATE (CTX "10:00") (ACTIONS previous next first last insert update delete))`  
Action: `next`  
State: `(STATE (CTX "Go to dentist") (ACTIONS previous next first last insert update delete))`  

We just traversed our persistent data without changing anything. Just to prepare the backend state for further operations, we may return to the beginning state:

Action: `exit`
State: `(STATE (CTX list) (ACTIONS next first last insert delete enter))`
Action: `first`
State: `(STATE (CTX "TASKS") (ACTIONS next first last insert update delete))`

And we are back where we started from after finishing entering the the data.

## Formal relation between middleware and backend

In simplified mathematical terms, let `D` be the persistent data structure, `p` the current pointer, and `q` the transient operational state, such as normal, inserting, or updating.

The backend exposes:

```
(C, A) = (Context(D, p, q), AvailableActions(D, p, q))
```

When the middleware sends an action `a ∈ A`, the backend updates the relevant state:

```
(D', p', q') = σ(D, p, q, a)
```

It then exposes the new context and available actions:

```
(C', A') = (Context(D', p', q'), AvailableActions(D', p', q'))
```

Here, `σ` represents the backend's transition rules. Not every action changes the persistent data, nor every action moves the pointer. For example, `first`, `last`, `previous`, `next`, `enter`, and `exit` only move the pointer, while `insert`, `update`, and `delete` only change the data.

Available actions depend on the context type and the pointer position within the list. Some actions may be automatically excluded if their applying would result with an error due to pointer's logically inferred properties such as: pointer is at the root list, pointer is at the beginning of the list, points after the end of the list, or points to a list versus atom. Pointing after the end of list is contextualized by `eol`.

There are two actions that require pairing with the next consequent action: `insert` and `update`. Both of them require additional data in a form of text action enclosed within quotes (atom) or a `list` action. While waiting for the consequent action, both `insert` and `update` are contextually identified by `inserting` or `updating`, and can exit the state of waiting for further data by sending the `cancel` action.

To corroborate the explanation with a diagram, the communication between the middleware and backend can be depicted by the following figure:

```
• • • • • • • • • • • • • • • • • • • • • • • •
•                 middleware                  •
• • • • • • • • • • • • • • • • • • • • • • • •
          ▲                         •
          •                         •
          •                         •
• • • • • • • • • • •     • • • • • • • • • • •
•     context,      •     •       action      •
•    action set     •     •                   •
• • • • • • • • • • •     • • • • • • • • • • •
          •                         •
          •                         •
          •                         ▼
• • • • • • • • • • • • • • • • • • • • • • • •
•                   backend                   •
• • • • • • • • • • • • • • • • • • • • • • • •
```

The middleware doesn't need to understand the transition function `σ`. It only needs to read `C` and `A` from the backend, select an action `a ∈ A`, and send the `a` back to the backend.

## Summary

Classical programming backends commonly manage the entire data persistence logic. Symbolback separates that role into (1) bare data pointer/input/output backend and (2) computational middleware that communicates with the minimal backend. As a consequence, backend offers a particular kind of interaction with the middleware, basing its essence in two clearly differentiated notions: action and response. Using the middleware, contextually dependent actions land at the backend which responds back to the middleware, sending a new context and assigned set of newly available actions.

The separation of user actions from computing responses hopefully brings some benefits that may include consistency in designing and experiencing the data persistence. Potential direction in which this could be interpreted is universality of the Symbolback backend. This proposition entails that the same minimal backend could be paired with arbitrarily different middlewares. It doesn't necessarily mean that the overall application complexity will be reduced, yet a considerable part of it could be shifted to the Symbolback middleware.

Still, the strongest idea in Symbolback isn't the separation of concerns between the backend and middleware. It is what such separation brings along: an interplay between the next actions that particular contexts make available, and the next contexts that follow from taking those actions. While this symmetry may be worth exploring in more depth, it renders Symbolback as an experimental excursion that still needs to be proved in the practice.
